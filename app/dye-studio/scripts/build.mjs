import fs from "node:fs";
const rd=p=>fs.readFileSync(new URL(p,import.meta.url),"utf8").trim()+"\n";
const out=new URL("../../public/dyed-and-unattached/dye-studio/",import.meta.url);
const v=Date.now().toString(36);
for(const f of fs.readdirSync(out))if(/^(studio|consumer|disc-photo)/.test(f)&&f!=="manifest.webmanifest")fs.rmSync(new URL(f,out));
fs.writeFileSync(new URL("engine.js",out),["../src/spectral.src.js","../src/engine.src.js","../src/catalog.generated.js","../src/dyes.generated.js"].map(rd).join("\n"));
for(const f of["duStencilCompiler.mjs","duStencilConstraints.mjs","photo-stencil.mjs"])fs.writeFileSync(new URL(f,out),rd("../src/"+f));
fs.writeFileSync(new URL("ui.js",out),rd("../src/ui.src.js"));
fs.writeFileSync(new URL("dye.css",out),rd("../src/ui.css"));
fs.writeFileSync(new URL("index.html",out),`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1">
<link rel="manifest" href="./manifest.webmanifest?v=ios-icons-20261020">
<link rel="apple-touch-icon" sizes="180x180" href="/brand/dyed-unattached-icon-180.png?v=ios-icons-20261020">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="D&U Studio">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<title>Dye Studio · Dyed &amp; Unattached · Local Roots</title>
<link rel="stylesheet" href="./dye.css?v=${v}">
</head>
<body>
<header class="top"><a class="brand" href="/" aria-label="Local Roots"><img src="/brand/local-roots-lr.svg" alt=""><strong>Local Roots</strong></a><a class="du" href="/dyed-and-unattached">Dyed &amp; Unattached</a><div class="acts"><button id="undo" class="dis">Undo</button><button id="redo" class="dis">Redo</button><button id="copy">Copy</button><button id="png" class="pri">Save</button></div></header>
<div class="app">
<section class="stage"><div class="vw"><div class="sq"><canvas id="cv"></canvas><canvas id="ov"></canvas></div></div><div class="dock"><div class="rd" id="rd"></div></div></section>
<section class="panel"><nav class="tabs" id="tabs"><button data-t="disc"><b>1</b>Disc</button><button data-t="blocks"><b>2</b>Blocks</button><button data-t="stencil"><b>3</b>Stencil</button></nav><div class="body" id="body"></div></section>
</div>
<div class="sheet" id="save"><div class="card" style="align-items:center"><img id="svimg" alt="" style="width:100%;max-width:420px;border-radius:12px;-webkit-touch-callout:default;-webkit-user-select:auto"><div class="row" style="width:100%;margin-top:12px"><a id="svdl" download="disc.png" class="g" style="text-decoration:none"><button class="pri" style="width:100%" tabindex="-1">Download</button></a><button id="svx" class="g">Close</button></div></div></div>
<input type="file" id="pfile" accept="image/*" hidden>
<div class="sheet" id="frame"><div class="card fr"><div class="frm"><canvas id="fv" width="640" height="640"></canvas><canvas id="fp" width="400" height="400"></canvas></div><div class="sl"><span class="nm">Zoom</span><input id="fz" type="range" min="100" max="400" value="100"><span class="pc" id="fzv">100%</span></div><div class="sl st"><span class="nm">Detail</span><input id="fd" type="range" min="0" max="100" value="60"></div><div class="sl st"><span class="nm">Balance</span><input id="fb" type="range" min="0" max="100" value="50"></div><div class="row" style="margin-top:8px"><button id="finv" class="st">Invert</button><button id="fx" class="g">Cancel</button><button id="fok" class="pri g dis">Add</button></div></div></div>
<div class="sheet" id="sheet"><div class="card"><div class="top"><input id="pq" type="search" placeholder="Search" autocomplete="off"><button id="px">Close</button></div><div class="ch" id="pch"></div><div class="dg2" id="pgr"></div></div></div>
<div class="sheet" id="match"><div class="card"><div class="top" style="justify-content:flex-end"><button id="mx">Close</button></div><div id="mbody" style="overflow-y:auto"></div></div></div>
<script src="./engine.js?v=${v}"></script>
<script src="./ui.js?v=${v}"></script>
</body>
</html>
`);
console.log("dye studio built");
