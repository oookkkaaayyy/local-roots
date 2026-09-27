import { useEffect } from 'react';
import { Shell } from '../components/Shell';

export function NotFoundPage() {
  useEffect(()=>{
    document.title='Page not found · Local Roots';
    let robots=document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots);}
    robots.content='noindex,nofollow,noarchive';
  },[]);

  return <Shell><main className="content narrow">
    <section className="branch-hero">
      <div>
        <span className="eyebrow">404</span>
        <h1>Page not found</h1>
                <div className="branch-actions">
          <a className="button primary" href="/">Home</a>
          <a className="button ghost" href="/events">Events</a>
        </div>
      </div>
    </section>
  </main></Shell>;
}