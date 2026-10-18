import { configReady } from './lib/supabase';
import { Shell } from './components/Shell';
import { EventsPage } from './pages/EventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { HbnfPage } from './pages/HbnfPage';
import { DyedUnattachedPage } from './pages/DyedUnattachedPage';
import { DuAdminPage } from './pages/DuAdminPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminPage } from './pages/AdminPage';
import { ReadinessPage } from './pages/ReadinessPage';
import { DyeStudioPage } from './pages/DyeStudioPage';

function ConfigMissing(){return <Shell><main className="content narrow"><div className="notice error"><strong>Local Roots configuration could not initialize.</strong><span>The public Supabase connection is unavailable. No private credentials should be entered here.</span></div></main></Shell>;}
function eventDetailSlug(path:string){if(!path.startsWith('/events/'))return null;const encoded=path.slice('/events/'.length);if(!encoded||encoded.includes('/'))return null;try{return decodeURIComponent(encoded);}catch{return null;}}

export default function LegacyRoutes(){
  const path=window.location.pathname.replace(/\/+$/,'')||'/';
  const detailSlug=eventDetailSlug(path);
  if(!configReady)return <ConfigMissing/>;
  if(path==='/admin/dyed-and-unattached')return <DuAdminPage/>;
  if(path==='/admin/readiness')return <ReadinessPage/>;
  if(path==='/admin/events'||path==='/admin')return <AdminPage/>;
  if(detailSlug)return <EventDetailPage slug={detailSlug}/>;
  if(path==='/events')return <EventsPage/>;
  if(path==='/hb-night-flyers'||path==='/hbnf')return <HbnfPage/>;
  if(path==='/dyed-and-unattached/dye-studio')return <DyeStudioPage/>;
  if(path==='/dyed-and-unattached'||path==='/du')return <DyedUnattachedPage/>;
  if(path==='/')return <EventsPage landing/>;
  return <NotFoundPage/>;
}
