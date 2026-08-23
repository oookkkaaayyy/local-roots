import type { ReactNode } from 'react';

export function Shell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return (
    <div className={`site-shell ${admin ? 'admin-shell' : ''}`}>
      <header className="site-header">
        <a className="brand" href="/events" aria-label="Local Roots events home">
          <span className="brand-mark">LR</span>
          <span><strong>Local Roots</strong><small>SoCal Disc Golf</small></span>
        </a>
        <nav>
          <a className="nav-events" href="/events">Events</a>
          <a className="nav-submit" href="/events#submit">Submit an event</a>
          {admin ? <a className="nav-admin" href="/admin/events">Admin</a> : null}
          {admin ? <a className="nav-readiness" href="/admin/readiness">Launch status</a> : null}
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
