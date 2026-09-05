import { Shell } from '../components/Shell';

export function NotFoundPage() {
  return <Shell><main className="content narrow">
    <section className="branch-hero">
      <div>
        <span className="eyebrow">404</span>
        <h1>Page not found</h1>
        <p>The link may be outdated or the address may be incorrect.</p>
        <div className="branch-actions">
          <a className="button primary" href="/">Home</a>
          <a className="button ghost" href="/events">Events</a>
        </div>
      </div>
    </section>
  </main></Shell>;
}