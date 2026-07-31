import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, Users, Plus, User } from 'lucide-react';
import { repo } from './lib/repo';
import { todayISO } from './lib/goals';
import { ToastProvider, useToast } from './components/UI';
import Onboarding from './screens/Onboarding';
import Today from './screens/Today';
import Groups from './screens/Groups';
import AddMeal from './screens/AddMeal';
import Me from './screens/Me';

function Shell() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [meals, setMeals] = useState([]);
  const [groups, setGroups] = useState([]);
  const [tab, setTab] = useState('today');
  const [groupView, setGroupView] = useState('auto'); // auto|picker|detail|join|create|sharing
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (u = user) => {
    if (!u) return;
    const [p, m, g] = await Promise.all([
      repo.getProfile(u.id),
      repo.listMeals(u.id, todayISO()),
      repo.listGroups(u.id),
    ]);
    setProfile(p); setMeals(m); setGroups(g);
  }, [user]);

  // boot: restore session
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const u = await repo.getSession();
      if (u) { setUser(u); await refresh(u); }
      setLoading(false);
      unsub = repo.onAuthChange(async (nu) => {
        setUser(nu);
        if (nu) await refresh(nu); else { setProfile(null); setMeals([]); setGroups([]); }
      });
    })();
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayCal = meals.reduce((a, m) => a + m.cal, 0);

  if (loading) return (
    <div className="phone"><div className="scroll" style={{ padding: '140px 30px', textAlign: 'center' }}>
      <div className="spinner" /></div></div>
  );

  if (!user || !profile) return (
    <div className="phone"><div className="scroll">
      <Onboarding onDone={async () => {
        const u = await repo.getSession();
        setUser(u); await refresh(u); setTab('today');
      }} />
    </div></div>
  );

  const openGroupsTab = () => {
    setTab('groups');
    setGroupView(groups.length === 1 ? 'detail' : 'auto');
    if (groups.length >= 1) setActiveGroupId(groups[0].id);
  };

  const NavBtn = ({ id, icon: Icon, label, onClick }) => (
    <button className={tab === id ? 'on' : ''} onClick={onClick ?? (() => setTab(id))}>
      <Icon size={28} /><span>{label}</span>
    </button>
  );

  return (
    <div className="phone tabbed">
      <div className="scroll">
        {tab === 'today' && (
          <Today profile={profile} meals={meals} groups={groups}
            onOpenGroup={(id) => { setActiveGroupId(id); setTab('groups'); setGroupView('detail'); }}
            onDeleteMeal={async (m) => {
              if (!window.confirm(`Remove "${m.name}"?`)) return;
              await repo.deleteMeal(user.id, m.id);
              await refresh();
              toast('Meal removed');
            }} />
        )}
        {tab === 'groups' && (
          <Groups user={{ ...user, name: profile.name }} groups={groups}
            view={groupView === 'auto' && groups.length === 1 ? 'detail' : groupView}
            setView={setGroupView}
            activeId={activeGroupId} setActiveId={setActiveGroupId}
            refresh={refresh} todayCal={todayCal}
            onGoMe={() => setTab('me')} />
        )}
        {tab === 'add' && (
          <AddMeal user={user} onSaved={async () => { await refresh(); setTab('today'); }} />
        )}
        {tab === 'me' && (
          <Me user={user} profile={profile} groups={groups} refresh={refresh}
            onSignOut={async () => { await repo.signOut(); setUser(null); setProfile(null); }} />
        )}
      </div>

      <div className="nav">
        <NavBtn id="today" icon={Clock3} label="Today" />
        <NavBtn id="groups" icon={Users} label="Groups" onClick={openGroupsTab} />
        <button className="addbtn" onClick={() => setTab('add')}><Plus size={28} /><span>Add</span></button>
        <NavBtn id="me" icon={User} label="Me" />
      </div>
    </div>
  );
}

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}
