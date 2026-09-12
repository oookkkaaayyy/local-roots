import type { ReactNode } from 'react';

export function Shell({children,admin=false}:{children:ReactNode;admin?:boolean}) {
  const raw=window.location.pathname.replace(/\/+$/,'')||'/';
  const path=raw==='/hbnf'?'/hb-night-flyers':raw==='/du'?'/dyed-and-unattached':raw;
  const current=(href:string)=>path===href?'page' as const:undefined;

  return <div className={`site-shell ${admin?'admin-shell':''}`}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Local Roots home" aria-current={current('/')}>
        <img className="brand-logo-mark" src="/brand/local-roots-lr.svg" alt="" aria-hidden="true" />
        <strong>Local Roots</strong>
      </a>
      <nav aria-label="Primary">
        <a className="nav-home" href="/" aria-current={current('/')}>Home</a>
        <a className="nav-events" href="/events" aria-current={current('/events')}>Events</a>
        <a className="nav-hbnf" href="/hb-night-flyers" aria-current={current('/hb-night-flyers')}>HB Night Flyers</a>
        <a className="nav-du" href="/dyed-and-unattached" aria-current={current('/dyed-and-unattached')}>Dyed &amp; Unattached</a>
        {admin?<a className="nav-admin" href="/admin/events" aria-current={path==='/admin'||path==='/admin/events'?'page':undefined}>Events admin</a>:null}
        {admin?<a className="nav-du-admin" href="/admin/dyed-and-unattached" aria-current={current('/admin/dyed-and-unattached')}>D&amp;U queue</a>:null}
        {admin?<a className="nav-readiness" href="/admin/readiness" aria-current={current('/admin/readiness')}>Launch status</a>:null}
      </nav>
    </header>
    <div id="main-content" tabIndex={-1}>{children}</div>
  </div>;
}
