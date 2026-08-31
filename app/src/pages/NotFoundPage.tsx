import { Shell } from '../components/Shell';

export function NotFoundPage() {
  return <Shell><main className="content narrow">
    <section className="branch-hero">
      <div>
        <span className="eyebrow">404 · Local Roots</span>
        <h1>That page isn’t here.</h1>
        <p>The link may be outdated or the address may have been entered incorrectly.</p>
        <div className="branch-actions">
          <a className="button primary" href="/">Go to Local Roots</a>
          <a className="button ghost" href="/events">Browse events</a>
        </div>
      </div>
    </section>
  </main></Shell>;
}
