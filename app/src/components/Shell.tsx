import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export function Shell({children,admin=false}:{children:ReactNode;admin?:boolean}) {
  const raw=window.location.pathname.replace(/\/+$/,'')||'/';
  const path=raw==='/hbnf'?'/hb-night-flyers':raw==='/du'?'/dyed-and-unattached':raw;
  const current=(href:string)=>path===href||path.startsWith(`${href}/`)?'page' as const:undefined;
  const eventsCurrent=path==='/'||path==='/events'||path.startsWith('/events/')?'page' as const:undefined;
  const [menuOpen,setMenuOpen]=useState(false);
  const menuButton=useRef<HTMLButtonElement>(null);
  const handleNavKeyDown=(event:KeyboardEvent<HTMLElement>)=>{if(event.key==='Escape'&&menuOpen){event.preventDefault();setMenuOpen(false);menuButton.current?.focus();}};

  return <div className={`site-shell ${admin?'admin-shell':'public-brand-shell'}`}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Local Roots home">
        <img className="brand-logo-mark" src="/brand/local-roots-lr.svg" alt="" aria-hidden="true" />
        <strong>Local Roots</strong>
      </a>
      <button ref={menuButton} className="mobile-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={()=>setMenuOpen(value=>!value)} onKeyDown={event=>{if(event.key==="Escape"&&menuOpen)setMenuOpen(false);}}>Menu</button>
      <nav id="primary-navigation" className={`primary-nav${menuOpen?' is-open':''}`} aria-label="Primary" onKeyDown={handleNavKeyDown} onClick={event=>{if((event.target as HTMLElement).closest('a'))setMenuOpen(false);}}>
        <a className="nav-events" href="/events" aria-current={eventsCurrent}>Events</a>
        <a className="nav-weather" href="/weather" aria-current={current('/weather')}>Weather</a>
        <a className="nav-du" href="/dyed-and-unattached" aria-current={current('/dyed-and-unattached')}>Dyed &amp; Unattached</a>
        {admin?<a className="nav-admin" href="/admin/events" aria-current={path==='/admin'||path==='/admin/events'?'page':undefined}>Events admin</a>:null}
        {admin?<a className="nav-du-admin" href="/admin/dyed-and-unattached" aria-current={current('/admin/dyed-and-unattached')}>D&amp;U queue</a>:null}
        {admin?<a className="nav-readiness" href="/admin/readiness" aria-current={current('/admin/readiness')}>Launch status</a>:null}
      </nav>
    </header>
    <div id="main-content" tabIndex={-1}>{children}</div>
    {!admin?<footer className="site-footer"><nav className="footer-nav" aria-label="Footer"><a href="https://hbnightflyers.com/">HB Night Flyers</a><a href="/hb-night-flyers">HB Night Flyers events</a>{path==='/dyed-and-unattached'?<a href="https://localrootsdg.com/admin/dyed-and-unattached" style={{fontSize:'.85rem'}}>Admin</a>:null}</nav></footer>:null}
  </div>;
}
