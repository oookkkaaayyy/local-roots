import { useEffect, useRef } from 'react';
import { Shell } from '../components/Shell';
import '../dye-studio.css';

export function DyeStudioPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const resize = () => {
      const document = frame.contentDocument;
      if (!document) return;
      const height = document.documentElement.clientWidth > 980
        ? Math.max(680, window.innerHeight - 140)
        : Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
      frame.style.height = `${height}px`;
    };
    const observeDocument = () => {
      const document = frame.contentDocument;
      if (!document) return;
      observer?.disconnect();
      observer = new ResizeObserver(resize);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
      void document.fonts?.ready.then(resize);
      resize();
    };

    frame.addEventListener('load', observeDocument);
    window.addEventListener('resize', resize);
    if (frame.contentDocument?.readyState === 'complete') observeDocument();
    return () => {
      frame.removeEventListener('load', observeDocument);
      window.removeEventListener('resize', resize);
      frame.contentWindow?.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, []);

  return <Shell>
    <main className="dye-studio-page">
      <h1 className="dye-studio-visually-hidden">Dye Studio</h1>
      <nav className="dye-studio-breadcrumb" aria-label="Breadcrumb">
        <a href="/dyed-and-unattached">Dyed &amp; Unattached</a>
        <span aria-current="page">Dye Studio</span>
      </nav>
      <iframe
        ref={frameRef}
        className="dye-studio-frame"
        src="/dye-studio/index.html"
        title="Dyed &amp; Unattached Disc Dye Studio v9.3"
        allow="clipboard-write"
        loading="eager"
      />
    </main>
  </Shell>;
}
