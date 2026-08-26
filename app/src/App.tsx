import { useEffect } from 'react';
import { configReady } from './lib/supabase';
import { Shell } from './components/Shell';
import { HomePage } from './pages/HomePage';
import { EventsPage } from './pages/EventsPage';
import { HbnfPage } from './pages/HbnfPage';
import { DyedUnattachedPage } from './pages/DyedUnattachedPage';
import { AdminPage } from './pages/AdminPage';
import { ReadinessPage } from './pages/ReadinessPage';

const PUBLIC_ORIGIN = 'https://localrootsdg.com';

const routeMetadata: Record<string, { title: string; description: string; canonical: string; noindex?: boolean }> = {
  '/': {
    title: 'Local Roots · Southern California Disc Golf',
    description: 'Local Roots connects Southern California disc golf events, HB Night Flyers and Dyed & Unattached.',
    canonical: '/',
  },
  '/events': {
    title: 'SoCal Disc Golf Events · Local Roots',
    description: 'Find current and upcoming disc golf events across Ventura, Los Angeles, Orange, Riverside, San Bernardino and San Diego counties.',
    canonical: '/events',
  },
  '/hb-night-flyers': {
    title: 'HB Night Flyers · Local Roots',
    description: 'HB Night Flyers community disc golf, weekly skins and glow events in Huntington Beach, California.',
    canonical: '/hb-night-flyers',
  },
  '/dyed-and-unattached': {
    title: 'Dyed & Unattached · Local Roots',
    description: 'Request a custom pet portrait disc stencil from Dyed & Unattached, a Local Roots sub-brand.',
    canonical: '/dyed-and-unattached',
  },
  '/admin': {
    title: 'Local Roots Admin',
    description: 'Local Roots administrative workspace.',
    canonical: '/admin',
    noindex: true,
  },
  '/admin/events': {
    title: 'Local Roots Event Admin',
    description: 'Local Roots event administration.',
    canonical: '/admin/events',
    noindex: true,
  },
  '/admin/readiness': {
    title: 'Local Roots Launch Status',
    description: 'Local Roots protected launch-readiness workspace.',
    canonical: '/admin/readiness',
    noindex: true,
  },
};

function useRouteMetadata(path: string) {
  useEffect(() => {
    const normalizedPath = path === '/hbnf' ? '/hb-night-flyers' : path === '/du' ? '/dyed-and-unattached' : path;
    const metadata = routeMetadata[normalizedPath] ?? routeMetadata['/'];
    document.title = metadata.title;

    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement('meta');
      description.name = 'description';
      document.head.appendChild(description);
    }
    description.content = metadata.description;

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${PUBLIC_ORIGIN}${metadata.canonical}`;

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (metadata.noindex) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.name = 'robots';
        document.head.appendChild(robots);
      }
      robots.content = 'noindex,nofollow,noarchive';
    } else if (robots) {
      robots.remove();
    }
  }, [path]);
}

function ConfigMissing() {
  return <Shell><main className="content narrow"><div className="notice error"><strong>Local Roots configuration could not initialize.</strong><span>The public Supabase connection is unavailable. No private credentials should be entered here.</span></div></main></Shell>;
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  useRouteMetadata(path);

  if (!configReady) return <ConfigMissing />;
  if (path === '/admin/readiness') return <ReadinessPage />;
  if (path === '/admin/events' || path === '/admin') return <AdminPage />;
  if (path === '/events') return <EventsPage />;
  if (path === '/hb-night-flyers' || path === '/hbnf') return <HbnfPage />;
  if (path === '/dyed-and-unattached' || path === '/du') return <DyedUnattachedPage />;
  return <HomePage />;
}
