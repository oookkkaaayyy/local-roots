import { useEffect } from 'react';
import { configReady } from './lib/supabase';
import { Shell } from './components/Shell';
import { EventsPage } from './pages/EventsPage';
import { AdminPage } from './pages/AdminPage';

function ConfigMissing() {
  return <Shell><main className="content narrow"><div className="notice error"><strong>Staging configuration is not connected yet.</strong><span>The deployment still needs its Supabase public environment variables.</span></div></main></Shell>;
}

function HomeRedirect() {
  useEffect(() => { window.history.replaceState(null, '', '/events'); }, []);
  return <EventsPage />;
}

export default function App() {
  if (!configReady) return <ConfigMissing />;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin/events' || path === '/admin') return <AdminPage />;
  if (path === '/events') return <EventsPage />;
  return <HomeRedirect />;
}
