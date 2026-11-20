import type { ReactNode } from 'react';

export type MastProps = { title: ReactNode; meta?: ReactNode; aside?: ReactNode; titleClass?: string };

export function Mast({title,meta,aside,titleClass}:MastProps){
  return <div className="lr-mast"><div className="lr-wrap lr-mast-in">
    <div className="lr-mast-text"><h1 className={titleClass}>{title}</h1>{meta?<p className="lr-mast-meta" aria-live="polite">{meta}</p>:null}</div>
    {aside?<div className="lr-mast-aside">{aside}</div>:null}
  </div></div>;
}

export function Shell({children,admin=false,mast}:{children:ReactNode;admin?:boolean;mast?:ReactNode}) {
  const raw=window.location.pathname.replace(/\/+$/,'')||'/';
  const path=raw==='/hbnf'?'/hb-night-flyers':raw==='/du'?'/dyed-and-unattached':raw;
  const current=(href:string)=>path===href||path.startsWith(`${href}/`)?'page' as const:undefined;
  const eventsCurrent=path==='/'||path==='/events'||path.startsWith('/events/')?'page' as const:undefined;
  const section=path.startsWith('/weather')?'weather':path.startsWith('/hb-night-flyers')?'hbnf':path.startsWith('/dyed-and-unattached')||path.startsWith('/admin/dyed-and-unattached')?'du':'events';

  if(admin)return <div className="site-shell admin-shell" data-section={section}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Local Roots home"><img className="brand-logo-mark" src="/brand/local-roots-lr.svg" alt="" aria-hidden="true" /><strong>Local Roots</strong></a>
      <nav id="primary-navigation" className="primary-nav" aria-label="Primary">
        <a className="nav-events" href="/events" aria-current={eventsCurrent}>Events</a>
        <a className="nav-weather" href="/weather" aria-current={current('/weather')}>Weather</a>
        <a className="nav-du" href="/dyed-and-unattached" aria-current={current('/dyed-and-unattached')}>Dyed &amp; Unattached</a>
        <a className="nav-admin" href="/admin/events" aria-current={path==='/admin'||path==='/admin/events'?'page':undefined}>Events admin</a>
        <a className="nav-du-admin" href="/admin/dyed-and-unattached" aria-current={current('/admin/dyed-and-unattached')}>D&amp;U queue</a>
        <a className="nav-readiness" href="/admin/readiness" aria-current={current('/admin/readiness')}>Launch status</a>
      </nav>
    </header>
    <div id="main-content" tabIndex={-1}>{children}</div>
  </div>;

  return <div className="site-shell public-brand-shell lr" data-section={section}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="lr-head"><div className="lr-wrap lr-head-in">
      <a className="lr-brand" href="/" aria-label="Local Roots home"><img src="/brand/local-roots-lr.svg" alt="" aria-hidden="true" width="40" height="43" /><span>Local Roots</span></a>
      <nav id="primary-navigation" className="lr-nav" aria-label="Primary">
        <a className="nav-events" href="/events" aria-current={eventsCurrent}>Events</a>
        <a className="nav-weather" href="/weather" aria-current={current('/weather')}>Weather</a>
        <a className="nav-du" href="/dyed-and-unattached" aria-current={current('/dyed-and-unattached')}>Dyed &amp; Unattached</a>
      </nav>
    </div></header>
    {mast}
    <div id="main-content" tabIndex={-1}>{children}</div>
    <footer className="lr-foot"><div className="lr-wrap lr-foot-in"><nav className="footer-nav" aria-label="Footer"><a href="https://hbnightflyers.com/">HB Night Flyers</a><a href="/hb-night-flyers">HB Night Flyers events</a>{path==='/dyed-and-unattached'?<a href="https://localrootsdg.com/admin/dyed-and-unattached">Admin</a>:null}</nav></div></footer>
  </div>;
}
