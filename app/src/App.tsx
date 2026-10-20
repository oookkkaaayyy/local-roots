import { lazy, Suspense, useEffect } from 'react';
import { WeatherPage } from './pages/WeatherPage';

const LegacyRoutes = lazy(() => import('./LegacyRoutes'));

const PUBLIC_ORIGIN = 'https://localrootsdg.com';
const ROOT_MANIFEST = '/manifest.webmanifest?v=736e7c6250fbb619';
const WEATHER_MANIFEST = '/weather/manifest.webmanifest';
const DU_MANIFEST = '/du-manifest.webmanifest?v=ios-icons-20261020';
const DU_PUBLIC_MANIFEST = '/dyed-and-unattached/manifest.webmanifest?v=ios-icons-20261020';
const LR_TOUCH_ICON = '/apple-touch-icon.png?v=af4a80127dd7f9cf';
const DU_TOUCH_ICON = '/brand/dyed-unattached-icon-180.png?v=ios-icons-20261020';
type RouteMetadata = { title: string; description: string; canonical?: string; noindex?: boolean };
const routeMetadata: Record<string, RouteMetadata> = {
  '/': {title:'Local Roots · Southern California Disc Golf',description:'Local Roots connects Southern California disc golf events, HB Night Flyers and Dyed & Unattached.',canonical:'/'},
  '/events': {title:'SoCal Disc Golf Events · Local Roots',description:'Find current and upcoming disc golf events across Ventura, Los Angeles, Orange, Riverside, San Bernardino and San Diego counties.',canonical:'/events'},
  '/hb-night-flyers': {title:'HB Night Flyers · Local Roots',description:'HB Night Flyers community disc golf, weekly skins and glow events in Huntington Beach, California.',canonical:'/hb-night-flyers'},
  '/dyed-and-unattached': {title:'Dyed & Unattached · Local Roots',description:'Request a custom pet portrait disc stencil from Dyed & Unattached, a Local Roots sub-brand.',canonical:'/dyed-and-unattached/'},
  '/dyed-and-unattached/dye-studio': {title:'Dye Studio · Dyed & Unattached · Local Roots',description:'Design a disc dye recipe with the Dyed & Unattached Disc Dye Studio.',canonical:'/dyed-and-unattached/dye-studio'},
  '/weather': {title:'Disc Golf Weather · Local Roots',description:'Compare verified Southern California disc golf course forecasts by playing hours.',canonical:'/weather'},
  '/admin': {title:'Local Roots Admin',description:'Local Roots administrative workspace.',canonical:'/admin',noindex:true},
  '/admin/events': {title:'Local Roots Event Admin',description:'Local Roots event administration.',canonical:'/admin/events',noindex:true},
  '/admin/readiness': {title:'Local Roots Launch Status',description:'Local Roots protected launch-readiness workspace.',canonical:'/admin/readiness',noindex:true},
  '/admin/dyed-and-unattached': {title:'D&U Production Queue · Local Roots',description:'Protected Dyed & Unattached production queue.',canonical:'/admin/dyed-and-unattached',noindex:true},
};
const notFoundMetadata: RouteMetadata={title:'Page not found · Local Roots',description:'The requested Local Roots page could not be found.',noindex:true};
function eventDetailSlug(path:string){if(!path.startsWith('/events/'))return null;const encoded=path.slice('/events/'.length);if(!encoded||encoded.includes('/'))return null;try{return decodeURIComponent(encoded);}catch{return null;}}
function useRouteMetadata(path:string){useEffect(()=>{const normalized=path==='/hbnf'?'/hb-night-flyers':path==='/du'?'/dyed-and-unattached':path;const eventDetail=eventDetailSlug(normalized)!=null;const metadata=routeMetadata[normalized]??(eventDetail?{title:'Disc Golf Event · Local Roots',description:'View Local Roots event details, registration information and authorized results.',canonical:normalized}:notFoundMetadata);document.title=metadata.title;let description=document.querySelector<HTMLMetaElement>('meta[name="description"]');if(!description){description=document.createElement('meta');description.name='description';document.head.appendChild(description);}description.content=metadata.description;let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(metadata.canonical){if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}canonical.href=`${PUBLIC_ORIGIN}${metadata.canonical}`;}else canonical?.remove();let robots=document.querySelector<HTMLMetaElement>('meta[name="robots"]');if(metadata.noindex){if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots);}robots.content='noindex,nofollow,noarchive';}else robots?.remove();const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"][data-app-manifest]');const touchIcon=document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"][data-app-touch-icon]');const appTitle=document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"][data-app-title]');const isDyeStudio=normalized==='/dyed-and-unattached/dye-studio';const isDuAdmin=normalized==='/admin/dyed-and-unattached';const isDuPublic=normalized==='/dyed-and-unattached';const isWeather=normalized==='/weather';if(manifest)manifest.href=isDuAdmin?DU_MANIFEST:isDuPublic?DU_PUBLIC_MANIFEST:isWeather?WEATHER_MANIFEST:ROOT_MANIFEST;if(touchIcon)touchIcon.href=isDuAdmin||isDyeStudio||isDuPublic?DU_TOUCH_ICON:LR_TOUCH_ICON;if(appTitle)appTitle.content=isDuAdmin||isDuPublic?'D&U':isDyeStudio?'D&U Studio':isWeather?'LR Weather':'Local Roots';},[path]);}
export default function App(){const path=window.location.pathname.replace(/\/+$/,'')||'/';useRouteMetadata(path);if(path==='/weather')return <WeatherPage/>;return <Suspense fallback={null}><LegacyRoutes/></Suspense>;}
