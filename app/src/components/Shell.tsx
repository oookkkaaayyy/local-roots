import type { ReactNode } from 'react';

export function Shell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return (
    <div className={`site-shell ${admin ? 'admin-shell' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Local Roots home">
          <span className="brand-mark">LR</span>
          <span><strong>Local Roots</strong><small>SoCal Disc Golf</small></span>
        </a>
        <nav aria-label="Primary">
          <a className="nav-home" href="/">Home</a>
          <a className="nav-events" href="/events">Events</a>
          <a className="nav-hbnf" href="/hb-night-flyers">HB Night Flyers</a>
          <a className="nav-du" href="/dyed-and-unattached">Dyed &amp; Unattached</a>
          <a className="nav-submit" href="/events#submit">Submit an event</a>
          {admin ? <a className="nav-admin" href="/admin/events">Admin</a> : null}
          {admin ? <a className="nav-readiness" href="/admin/readiness">Launch status</a> : null}
        </nav>
      </header>
      <div id="main-content" tabIndex={-1}>{children}</div>
      <footer className="site-footer">
        <span>Local Roots · Grown Local. Thrown Local.</span>
        <div className="footer-nav"><a href="/events">Events</a><a href="/hb-night-flyers">HBNF</a><a href="/dyed-and-unattached">D&amp;U</a></div>
      </footer>
    </div>
  );
}
