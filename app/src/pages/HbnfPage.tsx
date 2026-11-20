import { useEffect, useRef } from 'react';
import { Shell } from '../components/Shell';

const VIEWS = ['glow', 'skins', 'random', 'skills', 'tag-challenge'];

export function HbnfPage() {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get('view');
    if (view && VIEWS.includes(view) && frame.current) frame.current.src = `https://hbnightflyers.com/${view}`;
  }, []);
  return <Shell><main className="hbnf-embed"><iframe ref={frame} className="hbnf-frame" title="HB Night Flyers" src="https://hbnightflyers.com/" allow="geolocation" /></main></Shell>;
}
