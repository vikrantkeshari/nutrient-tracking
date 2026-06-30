-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Families Table (Invite Code System)
create table public.families (
  id uuid default uuid_generate_v4() primary key,
  family_name text not null,
  invite_code text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Profiles Table (Includes simple binary sharing toggle)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  family_id uuid references public.families(id) on delete set null,
  avatar_url text,
  daily_calorie_goal integer default 2000,
  daily_protein_goal integer default 150,
  daily_carb_goal integer default 200,
  daily_fat_goal integer default 70,
  -- Sharing toggle: Share complete details or nothing at all
  share_with_family boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Macro Logs Table (Includes AI Confidence & Edit Tracking)
create table public.macro_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  meal_name text not null,
  calories integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  thumbnail_path text,
  -- AI Metrics & Edit Tracking
  ai_confidence numeric(3,2),
  is_edited boolean default false not null,
  original_calories integer,
  original_protein_g integer,
  original_carbs_g integer,
  original_fat_g integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Shared Family Macro Logs View (All-or-Nothing Detail Filter)
create or replace view public.shared_macro_logs as
select
  l.id,
  l.user_id,
  p.display_name,
  l.meal_name,
  l.calories,
  l.protein_g,
  l.carbs_g,
  l.fat_g,
  l.thumbnail_path,
  l.created_at
from public.macro_logs l
join public.profiles p on l.user_id = p.id
-- Filter to only show logs of family members in the same family group
where p.family_id = (select family_id from public.profiles where id = auth.uid())
  -- Only return logs if the user has opted to share everything, or if querying own logs
  and (p.share_with_family = true or l.user_id = auth.uid());

-- Enable RLS on core tables
alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.macro_logs enable row level security;

-- RLS Policies
create policy "Allow reading active family profiles" on public.profiles
  for select using (family_id = (select family_id from public.profiles where id = auth.uid()));
create policy "Allow editing own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Allow inserting raw logs" on public.macro_logs
  for insert with check (auth.uid() = user_id);
create policy "Allow selecting own logs" on public.macro_logs
  for select using (auth.uid() = user_id);
create policy "Allow updating own log image references (for purge routines)" on public.macro_logs
  for update using (auth.uid() = user_id);
