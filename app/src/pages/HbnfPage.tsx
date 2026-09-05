import { Shell } from '../components/Shell';

export function HbnfPage() {
  return <Shell><main>
    <section className="branch-hero content hbnf-hero"><div><span className="eyebrow">Huntington Beach</span><h1>HB Night Flyers</h1><p>Club information, scores, standings, bag tags and event details are maintained on the HB Night Flyers site.</p><div className="branch-actions"><a className="button primary" href="https://hbnightflyers.com/" target="_blank" rel="noreferrer">Open hbnightflyers.com</a><a className="button ghost" href="/events">See SoCal events</a></div></div><div className="branch-monogram" aria-hidden="true">HBNF</div></section>
    <section className="branch-feature-grid content" aria-label="HB Night Flyers formats">
      <article><h2>Skins</h2><p>Weekly club round.</p></article>
      <article><h2>Glow doubles</h2><p>Monthly random-partner glow round.</p></article>
      <article><h2>Bag tags</h2><p>Club tag standings used across HBNF formats.</p></article>
    </section>
  </main></Shell>;
}