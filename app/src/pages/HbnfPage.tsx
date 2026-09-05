import { Shell } from '../components/Shell';

export function HbnfPage() {
  return <Shell><main>
    <section className="branch-hero content">
      <div>
        <h1>HB Night Flyers</h1>
        <div className="branch-actions">
          <a className="button primary" href="https://hbnightflyers.com/" target="_blank" rel="noreferrer">Open hbnightflyers.com</a>
          <a className="button ghost" href="/events">SoCal events</a>
        </div>
      </div>
    </section>
  </main></Shell>;
}