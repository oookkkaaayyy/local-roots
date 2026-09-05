import { Shell } from '../components/Shell';

const branches = [
  {
    eyebrow: 'Regional calendar',
    title: 'SoCal Disc Golf Events',
    copy: 'Tournaments, leagues, doubles, putting events and community rounds across Ventura, Los Angeles, Orange, Riverside, San Bernardino and San Diego counties.',
    href: '/events',
    cta: 'Browse events',
  },
  {
    eyebrow: 'Huntington Beach',
    title: 'HB Night Flyers',
    copy: 'Club information, scores, standings, bag tags and event details for HB Night Flyers.',
    href: '/hb-night-flyers',
    cta: 'Open HBNF',
  },
  {
    eyebrow: 'Custom disc art',
    title: 'Dyed & Unattached',
    copy: 'Submit reference photos for a custom pet portrait stencil used for disc dyeing.',
    href: '/dyed-and-unattached',
    cta: 'Request a stencil',
  },
];

export function HomePage() {
  return <Shell><main>
    <section className="hub-hero content">
      <div><h1>Local Roots</h1><p>Southern California disc golf events, HB Night Flyers and Dyed &amp; Unattached stencil requests.</p></div>
      <img className="hub-logo" src="/brand/local-roots-full.svg" alt="Local Roots" />
    </section>
    <section className="branch-grid content" aria-label="Local Roots resources">
      {branches.map(branch => <article className="branch-card" key={branch.href}><span className="eyebrow">{branch.eyebrow}</span><h2>{branch.title}</h2><p>{branch.copy}</p><a className="button primary" href={branch.href}>{branch.cta}</a></article>)}
    </section>
  </main></Shell>;
}