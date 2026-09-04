import { Shell } from '../components/Shell';

const branches = [
  {
    eyebrow: 'Regional calendar',
    title: 'SoCal Disc Golf Events',
    copy: 'A verified calendar of tournaments, leagues, doubles, putting events and community rounds from Ventura through San Diego.',
    href: '/events',
    cta: 'Browse events',
  },
  {
    eyebrow: 'Huntington Beach community',
    title: 'HB Night Flyers',
    copy: 'Weekly skins, glow rounds, bag tags and the community built around after-hours disc golf in Huntington Beach.',
    href: '/hb-night-flyers',
    cta: 'Visit HBNF',
  },
  {
    eyebrow: 'Custom disc art',
    title: 'Dyed & Unattached',
    copy: 'Custom pet portraits translated into cut-safe disc stencils through a photo-first request and production workflow.',
    href: '/dyed-and-unattached',
    cta: 'Request a stencil',
  },
];

export function HomePage() {
  return <Shell><main>
    <section className="hub-hero content">
      <div><span className="eyebrow">Southern California disc golf</span><h1>Local roots. Connected.</h1><p>Events, community and disc art built around the people and places that make Southern California disc golf what it is.</p></div>
      <img className="hub-logo" src="/brand/local-roots-full.svg" alt="Local Roots" />
    </section>
    <section className="hub-intro content" aria-labelledby="explore-local-roots"><div><span className="eyebrow">Explore Local Roots</span><h2 id="explore-local-roots">One hub. Three ways in.</h2></div><p>Start with the regional event calendar, connect with HB Night Flyers, or request a custom Dyed &amp; Unattached stencil.</p></section>
    <section className="branch-grid content" aria-label="Local Roots projects">
      {branches.map(branch => <article className="branch-card" key={branch.href}><span className="eyebrow">{branch.eyebrow}</span><h2>{branch.title}</h2><p>{branch.copy}</p><a className="button primary" href={branch.href}>{branch.cta}</a></article>)}
    </section>
    <section className="hub-callout content"><div><span className="eyebrow">Built locally</span><h2>A shared home for what comes next.</h2></div><p>Local Roots is the umbrella. New community projects, products and stories can grow here without fragmenting into separate destinations.</p></section>
  </main></Shell>;
}
