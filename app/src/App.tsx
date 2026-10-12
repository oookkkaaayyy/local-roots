import { useEffect } from 'react';
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

const PUBLIC_ORIGIN = 'https://localrootsdg.com';
type RouteMetadata = { title: string; description: string; canonical?: string; noindex?: boolean };
const routeMetadata: Record<string, RouteMetadata> = {
  '/': {title:'Local Roots · Southern California Disc Golf',description:'Local Roots connects Southern California disc golf events, HB Night Flyers and Dyed & Unattached.',canonical:'/'},
  '/events': {title:'SoCal Disc Golf Events · Local Roots',description:'Find current and upcoming disc golf events across Ventura, Los Angeles, Orange, Riverside, San Bernardino and San Diego counties.',canonical:'/events'},
  '/hb-night-flyers': {title:'HB Night Flyers · Local Roots',description:'HB Night Flyers community disc golf, weekly skins and glow events in Huntington Beach, California.',canonical:'/hb-night-flyers'},
  '/dyed-and-unattached': {title:'Dyed & Unattached · Local Roots',description:'Request a custom pet portrait disc stencil from Dyed & Unattached, a Local Roots sub-brand.',canonical:'/dyed-and-unattached'},
  '/dyed-and-unattached/dye-studio': {title:'Dye Studio · Dyed & Unattached · Local Roots',description:'Design a disc dye recipe with the Dyed & Unattached Disc Dye Studio.',canonical:'/dyed-and-unattached/dye-studio'},
  '/admin': {title:'Local Roots Admin',description:'Local Roots administrative workspace.',canonical:'/admin',noindex:true},
  '/admin/events': {title:'Local Roots Event Admin',description:'Local Roots event administration.',canonical:'/admin/events',noindex:true},
  '/admin/readiness': {title:'Local Roots Launch Status',description:'Local Roots protected launch-readiness workspace.',canonical:'/admin/readiness',noindex:true},
  '/admin/dyed-and-unattached': {title:'D&U Production Queue · Local Roots',description:'Protected Dyed & Unattached production queue.',canonical:'/admin/dyed-and-unattached',noindex:true},
};
const notFoundMetadata: RouteMetadata={title:'Page not found · Local Roots',description:'The requested Local Roots page could not be found.',noindex:true};
function eventDetailSlug(path:string){if(!path.startsWith('/events/'))return null;const encoded=path.slice('/events/'.length);if(!encoded||encoded.includes('/'))return null;try{return decodeURIComponent(encoded);}catch{return null;}}
function useRouteMetadata(path:string){useEffect(()=>{const normalized=path==='/hbnf'?'/hb-night-flyers':path==='/du'?'/dyed-and-unattached':path;const eventDetail=eventDetailSlug(normalized)!=null;const metadata=routeMetadata[normalized]??(eventDetail?{title:'Disc Golf Event · Local Roots',description:'View Local Roots event details, registration information and authorized results.',canonical:normalized}:notFoundMetadata);document.title=metadata.title;let description=document.querySelector<HTMLMetaElement>('meta[name="description"]');if(!description){description=document.createElement('meta');description.name='description';document.head.appendChild(description);}description.content=metadata.description;let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(metadata.canonical){if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}canonical.href=`${PUBLIC_ORIGIN}${metadata.canonical}`;}else canonical?.remove();let robots=document.querySelector<HTMLMetaElement>('meta[name="robots"]');if(metadata.noindex){if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots);}robots.content='noindex,nofollow,noarchive';}else robots?.remove();},[path]);}
function ConfigMissing(){return <Shell><main className="content narrow"><div className="notice error"><strong>Local Roots configuration could not initialize.</strong><span>The public Supabase connection is unavailable. No private credentials should be entered here.</span></div></main></Shell>;}
export default function App(){const path=window.location.pathname.replace(/\/+$/,'')||'/';const detailSlug=eventDetailSlug(path);useRouteMetadata(path);if(!configReady)return <ConfigMissing/>;if(path==='/admin/dyed-and-unattached')return <DuAdminPage/>;if(path==='/admin/readiness')return <ReadinessPage/>;if(path==='/admin/events'||path==='/admin')return <AdminPage/>;if(detailSlug)return <EventDetailPage slug={detailSlug}/>;if(path==='/events')return <EventsPage/>;if(path==='/hb-night-flyers'||path==='/hbnf')return <HbnfPage/>;if(path==='/dyed-and-unattached/dye-studio')return <DyeStudioPage/>;if(path==='/dyed-and-unattached'||path==='/du')return <DyedUnattachedPage/>;if(path==='/')return <EventsPage landing/>;return <NotFoundPage/>;}
