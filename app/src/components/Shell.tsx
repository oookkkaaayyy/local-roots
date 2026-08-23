import type { ReactNode } from 'react';

export function Shell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/events" aria-label="Local Roots events home">
          <span className="brand-mark">LR</span>
          <span><strong>Local Roots</strong><small>SoCal Disc Golf</small></span>
        </a>
        <nav>
          <a href="/events">Events</a>
          <a href="/events#submit">Submit an event</a>
          {admin ? <a href="/admin/events">Admin</a> : null}
          {admin ? <a href="/admin/readiness">Launch status</a> : null}
        </nav>
      </header>
      {children}
      <footer className="site-footer">
        <span>Local Roots · Grown Local. Thrown Local.</span>
        <a href="/events#submit">Missing an event?</a>
      </footer>
    </div>
  );
}
