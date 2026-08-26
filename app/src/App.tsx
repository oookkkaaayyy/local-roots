import { configReady } from './lib/supabase';
import { Shell } from './components/Shell';
import { HomePage } from './pages/HomePage';
import { EventsPage } from './pages/EventsPage';
import { HbnfPage } from './pages/HbnfPage';
import { DyedUnattachedPage } from './pages/DyedUnattachedPage';
import { AdminPage } from './pages/AdminPage';
import { ReadinessPage } from './pages/ReadinessPage';

function ConfigMissing() {
  return <Shell><main className="content narrow"><div className="notice error"><strong>Local Roots configuration could not initialize.</strong><span>The public Supabase connection is unavailable. No private credentials should be entered here.</span></div></main></Shell>;
}

export default function App() {
  if (!configReady) return <ConfigMissing />;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin/readiness') return <ReadinessPage />;
  if (path === '/admin/events' || path === '/admin') return <AdminPage />;
  if (path === '/events') return <EventsPage />;
  if (path === '/hb-night-flyers' || path === '/hbnf') return <HbnfPage />;
  if (path === '/dyed-and-unattached' || path === '/du') return <DyedUnattachedPage />;
  return <HomePage />;
}
