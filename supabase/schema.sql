-- ============================================================
-- Nutrient Tracking — Schema v2 (multi-group sharing)
-- Fresh install script. Replaces the v1 families-based schema.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pg_cron;

-- ---------- 1. Profiles ----------
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  avatar_url text,
  daily_calorie_goal integer not null default 2000,
  daily_protein_goal integer not null default 150,
  daily_carb_goal integer not null default 200,
  daily_fat_goal integer not null default 70,
  age integer,
  weight numeric(5,2),   -- kg
  height numeric(5,2),   -- cm
  created_at timestamptz not null default now()
);

-- ---------- 2. Groups ----------
create table public.groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  group_type text not null default 'other'
    check (group_type in ('family','gym','office','other')),
  invite_code text unique not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 3. Group membership (sharing level lives HERE) ----------
create table public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  user_id  uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  share_level text not null default 'totals'
    check (share_level in ('detailed','totals','none')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------- 4. Macro logs ----------
create table public.macro_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  meal_name text not null,
  calories integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  thumbnail_path text,
  -- device-local calendar date, stamped by the client at insert
  logged_date date not null,
  -- AI accountability
  ai_confidence numeric(3,2),
  is_edited boolean not null default false,
  original_calories integer,
  original_protein_g integer,
  original_carbs_g integer,
  original_fat_g integer,
  created_at timestamptz not null default now()
);
create index macro_logs_user_date on public.macro_logs (user_id, logged_date);

-- ============================================================
-- Security-definer helpers.
-- RLS policies on group_members that query group_members recurse
-- infinitely; these functions bypass RLS safely.
-- ============================================================
create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer set search_path = public as
$$ select exists (select 1 from group_members
                  where group_id = gid and user_id = auth.uid()); $$;

create or replace function public.shares_groups_with(uid uuid)
returns boolean language sql security definer set search_path = public as
$$ select exists (select 1 from group_members a
                  join group_members b using (group_id)
                  where a.user_id = auth.uid() and b.user_id = uid); $$;

-- Highest share level `uid` has granted in any group shared with caller
-- (detailed > totals > none)
create or replace function public.effective_share(uid uuid)
returns text language sql security definer set search_path = public as
$$ select coalesce(
     (select case when bool_or(b.share_level='detailed') then 'detailed'
                  when bool_or(b.share_level='totals')   then 'totals'
                  else 'none' end
      from group_members a
      join group_members b using (group_id)
      where a.user_id = auth.uid() and b.user_id = uid), 'none'); $$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.macro_logs    enable row level security;

-- Profiles: self + anyone sharing a group with you
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.shares_groups_with(id));
create policy "profiles_insert" on public.profiles for insert
  with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update
  using (auth.uid() = id);

-- Groups: members can read; joins resolve codes via join_group_by_code()
-- (no open SELECT — prevents invite-code enumeration, PRD G12)
create policy "groups_select_member" on public.groups for select
  using (public.is_group_member(id));
create policy "groups_insert" on public.groups for insert
  with check (auth.role() = 'authenticated' and created_by = auth.uid());
create policy "groups_update_owner" on public.groups for update
  using (exists (select 1 from public.group_members
                 where group_id = id and user_id = auth.uid() and role = 'owner'));

-- Group members
create policy "gm_select" on public.group_members for select
  using (user_id = auth.uid() or public.is_group_member(group_id));
create policy "gm_insert_self" on public.group_members for insert
  with check (user_id = auth.uid());
create policy "gm_update_self" on public.group_members for update
  using (user_id = auth.uid());            -- change own share_level
create policy "gm_delete" on public.group_members for delete
  using (user_id = auth.uid()              -- leave
    or exists (select 1 from public.group_members g   -- owner removes member
               where g.group_id = group_members.group_id
                 and g.user_id = auth.uid() and g.role = 'owner'));

-- Macro logs: own rows only (sharing goes through the views)
create policy "logs_insert" on public.macro_logs for insert
  with check (auth.uid() = user_id);
create policy "logs_select_own" on public.macro_logs for select
  using (auth.uid() = user_id);
create policy "logs_update_own" on public.macro_logs for update
  using (auth.uid() = user_id);
create policy "logs_delete_own" on public.macro_logs for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Join by invite code (security definer: resolves codes without
-- an open SELECT policy on groups)
-- ============================================================
create or replace function public.join_group_by_code(code text, level text default 'totals')
returns json language plpgsql security definer set search_path = public as $$
declare g record;
begin
  if level not in ('detailed','totals','none') then
    raise exception 'invalid share level';
  end if;
  select id, name, group_type into g from groups
    where invite_code = upper(trim(code));
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if exists (select 1 from group_members
             where group_id = g.id and user_id = auth.uid()) then
    return json_build_object('ok', false, 'error', 'already_member');
  end if;
  insert into group_members (group_id, user_id, role, share_level)
    values (g.id, auth.uid(), 'member', level);
  return json_build_object('ok', true, 'group_id', g.id, 'name', g.name);
end $$;

-- Rotate invite code (owner only)
create or replace function public.rotate_invite_code(gid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare new_code text;
begin
  if not exists (select 1 from group_members
                 where group_id = gid and user_id = auth.uid() and role = 'owner') then
    raise exception 'not_owner';
  end if;
  new_code := 'GRP-' || upper(substr(md5(random()::text), 1, 6));
  update groups set invite_code = new_code where id = gid;
  return new_code;
end $$;

-- ============================================================
-- Sharing views (NO thumbnail_path anywhere — photos never shared)
-- ============================================================

-- Individual meals from members sharing 'detailed' in a common group
create or replace view public.shared_meal_logs as
select l.id, l.user_id, p.display_name, l.meal_name,
       l.calories, l.protein_g, l.carbs_g, l.fat_g,
       l.logged_date, l.created_at
from public.macro_logs l
join public.profiles p on p.id = l.user_id
where l.user_id = auth.uid()
   or public.effective_share(l.user_id) = 'detailed';

-- Daily aggregates from members sharing 'detailed' or 'totals'
create or replace view public.shared_daily_totals as
select l.user_id, p.display_name, l.logged_date,
       sum(l.calories) as calories, sum(l.protein_g) as protein_g,
       sum(l.carbs_g)  as carbs_g,  sum(l.fat_g)    as fat_g
from public.macro_logs l
join public.profiles p on p.id = l.user_id
where l.user_id = auth.uid()
   or public.effective_share(l.user_id) in ('detailed','totals')
group by l.user_id, p.display_name, l.logged_date;

-- Views run with owner rights; the effective_share() predicate is the
-- security boundary. Callers only ever see rows the grantor allowed.

-- ============================================================
-- Storage: private thumbnails bucket, owner-only (PRD G3)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do update set public = false;

create policy "thumb_insert_own" on storage.objects for insert
  with check (bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "thumb_select_own" on storage.objects for select
  using (bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "thumb_delete_own" on storage.objects for delete
  using (bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Profile auto-creation on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, age, weight, height,
    daily_calorie_goal, daily_protein_goal, daily_carb_goal, daily_fat_goal)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    (new.raw_user_meta_data->>'age')::integer,
    (new.raw_user_meta_data->>'weight')::numeric,
    (new.raw_user_meta_data->>'height')::numeric,
    coalesce((new.raw_user_meta_data->>'goal_cal')::integer, 2000),
    coalesce((new.raw_user_meta_data->>'goal_pro')::integer, 150),
    coalesce((new.raw_user_meta_data->>'goal_carb')::integer, 200),
    coalesce((new.raw_user_meta_data->>'goal_fat')::integer, 70));
  return new;
end $$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 30-day photo retention, server-side (PRD G9). Nightly 03:00 UTC.
-- Deletes stored files and clears references; macro text is kept.
-- ============================================================
create or replace function public.purge_old_thumbnails()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from storage.objects o
  using public.macro_logs l
  where o.bucket_id = 'thumbnails'
    and o.name = l.thumbnail_path
    and l.created_at < now() - interval '30 days';
  update public.macro_logs
    set thumbnail_path = null
    where thumbnail_path is not null
      and created_at < now() - interval '30 days';
end $$;

select cron.schedule('purge-thumbnails-nightly', '0 3 * * *',
  $$select public.purge_old_thumbnails()$$);
