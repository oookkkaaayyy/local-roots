import { useEffect } from 'react';
import { Shell, Mast } from '../components/Shell';
import { DuSwitch } from '../components/DuSwitch';
import { loadStudio } from './studioLoader';

export function StencilPage() {
  useEffect(() => { loadStudio('stencil'); }, []);
  return <Shell mast={<Mast title="Stencil" aside={<DuSwitch active="stencil"/>} />}><main id="studio" className="ds-page"><div className="ds stp">
    <input type="file" id="pfile" accept="image/*" hidden />
    <div id="frame" className="stframe" data-state="empty" data-gen="0" data-busy="0">
      <div className="stpickw">
        <button id="stpick" className="stbig"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 10h5l2-3h10l2 3h5v15H4z"/><circle cx="16" cy="17" r="5"/></svg><span id="stpl">Choose a photo</span></button>
        <div id="stleft" className="stmeta"></div>
      </div>
      <div className="stwork">
        <canvas id="fp" width="800" height="800"></canvas>
        <div id="gth" className="gth"></div>
        <div className="stctl">
          <div className="stvar"><button id="gd1" className="dis">Lighter</button><button id="gd2" className="dis">Bolder</button><button id="gd3" className="dis">Closer</button></div>
          <div className="sl gn"><span className="nm">Detail</span><input id="gt" type="range" min="0" max="4" step="1" defaultValue="0"/></div>
          <div className="sl gn"><span className="nm">Size</span><input id="gz" type="range" min="40" max="100" defaultValue="100"/></div>
          <div className="sttools"><button id="gfit">Fit</button><button id="gmi">Mirror</button><button id="ger">Erase</button><button id="gun" className="dis">Undo</button><button id="grd" className="dis">Redo</button></div>
        </div>
        <div id="fleft" className="stmeta"></div>
        <div className="stfoot"><button id="stnew">New photo</button><button id="stsave" className="pri">Save</button><button id="stsvg" hidden>Cricut SVG</button></div>
      </div>
      <div id="er" className="er"><div id="erw" className="erw"><canvas id="erc" width="64" height="64"></canvas></div><div className="row"><input id="erz" type="range" min="100" max="500" defaultValue="100"/><button id="ers" className="on">Small</button><button id="erl">Large</button><button id="eru" className="dis">Undo</button><button id="erd" className="pri">Done</button></div></div>
    </div>
    <div hidden>
      <canvas id="fv" width="640" height="640"></canvas>
      <input id="fz" type="range" min="100" max="400" defaultValue="100"/><span id="fzv"></span><input id="fd" type="range" min="0" max="100" defaultValue="70"/><input id="fb" type="range" min="0" max="100" defaultValue="70"/>
      <div id="fstyle"></div><button id="fcut" className="on">Cutout</button><button id="finv">Invert</button><button id="fx">Cancel</button><button id="fok" className="dis">Add</button><button id="gsv">Save image</button>
      <div className="bar"><button id="undo">Undo</button><button id="redo">Redo</button><button id="copy">Copy</button><button id="png">Save</button></div>
      <div className="vw"><div className="sq"><canvas id="cv"></canvas><canvas id="ov"></canvas></div></div><div id="rd"></div><div id="body"></div>
      <div id="save"><img id="svimg" alt=""/><a id="svdl"></a><button id="svx">Close</button></div>
      <div id="sheet"><input id="pq"/><button id="px">Close</button><div id="pch"></div><div id="pgr"></div></div>
      <div id="match"><button id="mx">Close</button><div id="mbody"></div></div>
    </div>
  </div></main></Shell>;
}
