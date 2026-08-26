import { Shell } from '../components/Shell';

export function HbnfPage() {
  return <Shell><main>
    <section className="branch-hero content hbnf-hero"><div><span className="eyebrow">Huntington Beach · Community</span><h1>HB Night Flyers</h1><p>After-hours disc golf in Huntington Beach: skins, glow doubles, bag tags and the people who keep the course moving after sunset.</p><div className="branch-actions"><a className="button primary" href="https://hbnightflyers.com/" target="_blank" rel="noreferrer">Open HB Night Flyers</a><a className="button ghost" href="/events">See SoCal events</a></div></div><div className="branch-monogram" aria-hidden="true">HBNF</div></section>
    <section className="branch-feature-grid content">
      <article><span className="eyebrow">Weekly</span><h2>Skins</h2><p>A recurring local round built for simple competition, repeat play and a strong regular community.</p></article>
      <article><span className="eyebrow">Monthly</span><h2>Glow doubles</h2><p>Random-partner glow rounds that turn the course into a different experience after dark.</p></article>
      <article><span className="eyebrow">Ongoing</span><h2>Bag tags</h2><p>A shared tag system that follows players across club formats and keeps every round connected.</p></article>
    </section>
    <section className="branch-bottom content"><div><span className="eyebrow">Full club site</span><h2>Scores, standings and club details live at HBNF.</h2></div><a className="button primary" href="https://hbnightflyers.com/" target="_blank" rel="noreferrer">Go to hbnightflyers.com</a></section>
  </main></Shell>;
}
