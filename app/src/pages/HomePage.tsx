import { Shell } from '../components/Shell';

const branches = [
  { title: 'SoCal Disc Golf Events', href: '/events', cta: 'Browse events' },
  { title: 'HB Night Flyers', href: '/hb-night-flyers', cta: 'Open HBNF' },
  { title: 'Dyed & Unattached', href: '/dyed-and-unattached', cta: 'Request a stencil' },
];

export function HomePage() {
  return <Shell><main>
    <section className="hub-hero content">
      <h1 className="sr-only">Local Roots</h1>
      <img className="hub-logo hub-logo-primary" src="/brand/local-roots-full.svg" alt="" aria-hidden="true" />
    </section>
    <section className="branch-grid content" aria-label="Local Roots sections">
      {branches.map(branch => <article className="branch-card" key={branch.href}><h2>{branch.title}</h2><a className="button primary" href={branch.href}>{branch.cta}</a></article>)}
    </section>
  </main></Shell>;
}