import { useEffect } from 'react';
import { Shell } from '../components/Shell';

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

export function DyeStudioPage() {
  useEffect(() => {
    const w = window as unknown as { __dyeStudio?: boolean };
    if (w.__dyeStudio) return;
    w.__dyeStudio = true;
    const v = __STUDIO_BUILD__;
    (w as unknown as { __dsv?: string }).__dsv = v;
    loadScript(`${BASE}engine.js?v=${v}`).then(() => loadScript(`${BASE}ui.js?v=${v}`)).catch(() => { w.__dyeStudio = false; });
  }, []);
  return <Shell><main id="studio" className="ds-page"><div className="ds">
    <div className="bar"><button id="undo" className="dis">Undo</button><button id="redo" className="dis">Redo</button><button id="copy">Copy</button><button id="png" className="pri">Save</button></div>
    <div className="app">
      <section className="stage"><div className="vw"><div className="sq"><canvas id="cv"></canvas><canvas id="ov"></canvas></div></div><div className="dock"><div className="rd" id="rd"></div></div></section>
      <section className="panel"><nav className="tabs" id="tabs"><button data-t="disc"><b>1</b>Disc</button><button data-t="design"><b>2</b>Design</button><button data-t="stencil"><b>3</b>Stencil</button></nav><div className="body" id="body"></div></section>
    </div>
    <div className="sheet" id="save"><div className="card" style={{alignItems:'center'}}><img id="svimg" alt="" style={{width:'100%',maxWidth:420,borderRadius:12}}/><div className="row" style={{width:'100%',marginTop:12}}><a id="svdl" download="disc.png" className="g" style={{textDecoration:'none'}}><button className="pri" style={{width:'100%'}} tabIndex={-1}>Download</button></a><button id="svx" className="g">Close</button></div></div></div>
    <input type="file" id="pfile" accept="image/*" hidden />
    <div className="sheet" id="frame"><div className="card fr"><div className="frm"><canvas id="fv" width="640" height="640"></canvas><canvas id="fp" width="400" height="400"></canvas></div><div id="gth" className="st gth"></div><div id="er" className="st er"><div id="erw" className="erw"><canvas id="erc" width="64" height="64"></canvas></div><div className="row"><input id="erz" type="range" min="100" max="500" defaultValue="100"/><button id="ers" className="on">Small</button><button id="erl">Large</button><button id="eru" className="dis">Undo</button><button id="erd" className="pri">Done</button></div></div><div className="sl"><span className="nm">Zoom</span><input id="fz" type="range" min="100" max="400" defaultValue="100"/><span className="pc" id="fzv">100%</span></div><div className="sl st"><span className="nm">Detail</span><input id="fd" type="range" min="0" max="100" defaultValue="70"/></div><div className="sl st"><span className="nm">Balance</span><input id="fb" type="range" min="0" max="100" defaultValue="70"/></div><div className="sl st gn"><span className="nm">Detail</span><input id="gt" type="range" min="-3" max="4" step="1" defaultValue="0"/></div><div className="sl st gn"><span className="nm">Simplify</span><input id="gs" type="range" min="0" max="3" step="1" defaultValue="0"/></div><div className="sl st gn"><span className="nm">Size</span><input id="gz" type="range" min="40" max="100" defaultValue="100"/></div><div className="row" style={{marginTop:8}}><button id="gfit" className="st">Fit</button><button id="gmi" className="st">Mirror</button><button id="ger" className="st">Erase</button><button id="gun" className="st dis">Undo</button><button id="grd" className="st dis">Redo</button><button id="gsv" className="st">Save image</button></div><div className="row" style={{marginTop:8}}><button id="gd1" className="st sm dis">Lighter</button><button id="gd2" className="st sm dis">Bolder</button><button id="gd3" className="st sm dis">Closer</button><span id="fleft" className="st"></span></div><div className="row" style={{marginTop:8}}><button id="fcut" className="st on">Cutout</button><button id="finv" className="st">Invert</button><button id="fx" className="g">Cancel</button><button id="fok" className="pri g dis">Add</button></div></div></div>
    <div className="sheet" id="sheet"><div className="card"><div className="top"><input id="pq" type="search" placeholder="Search" autoComplete="off"/><button id="px">Close</button></div><div className="ch" id="pch"></div><div className="dg2" id="pgr"></div></div></div>
    <div className="sheet" id="match"><div className="card"><div className="top" style={{justifyContent:'flex-end'}}><button id="mx">Close</button></div><div id="mbody" style={{overflowY:'auto'}}></div></div></div>
  </div></main></Shell>;
}
