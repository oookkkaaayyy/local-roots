const BASE = '/dyed-and-unattached/dye-studio/';
function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(src));
    document.body.appendChild(el);
  });
}
export function loadStudio(tool: 'stencil' | 'dye') {
  const w = window as unknown as { __dyeStudio?: boolean; __dsv?: string; __dsTool?: string };
  if (w.__dyeStudio) return;
  w.__dyeStudio = true;
  const v = __STUDIO_BUILD__;
  w.__dsv = v;
  w.__dsTool = tool;
  loadScript(`${BASE}engine.js?v=${v}`).then(() => loadScript(`${BASE}ui.js?v=${v}`)).catch(() => { w.__dyeStudio = false; });
}
