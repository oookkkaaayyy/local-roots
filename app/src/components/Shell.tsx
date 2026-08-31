import type { ReactNode } from 'react';

export function Shell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const path = rawPath === '/hbnf' ? '/hb-night-flyers' : rawPath === '/du' ? '/dyed-and-unattached' : rawPath;
  const current = (href: string) => path === href ? 'page' as const : undefined;

  return (
    <div className={`site-shell ${admin ? 'admin-shell' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Local Roots home" aria-current={current('/')}>
          <span className="brand-mark">LR</span>
          <span><strong>Local Roots</strong><small>SoCal Disc Golf</small></span>
        </a>
        <nav aria-label="Primary">
          <a className="nav-home" href="/" aria-current={current('/')}>Home</a>
          <a className="nav-events" href="/events" aria-current={current('/events')}>Events</a>
          <a className="nav-hbnf" href="/hb-night-flyers" aria-current={current('/hb-night-flyers')}>HB Night Flyers</a>
          <a className="nav-du" href="/dyed-and-unattached" aria-current={current('/dyed-and-unattached')}>Dyed &amp; Unattached</a>
          <a className="nav-submit" href="/events#submit">Submit an event</a>
          {admin ? <a className="nav-admin" href="/admin/events" aria-current={path === '/admin' || path === '/admin/events' ? 'page' : undefined}>Admin</a> : null}
          {admin ? <a className="nav-readiness" href="/admin/readiness" aria-current={current('/admin/readiness')}>Launch status</a> : null}
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
