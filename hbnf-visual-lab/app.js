const $ = id => document.getElementById(id);

const requested = { energy: 65, audioResponse: 75, motion: 60, variation: 85, couplingMode: "related", paletteId: "hbnf-balanced" };
const confirmed = { matrix: { confirmation: "mock", revision: 0, at: null }, aux: { confirmation: "mock", revision: 0, at: null } };
const palettes = {
  "hbnf-balanced": [[50,255,175],[95,130,255],[255,80,170],[255,215,80]],
  "neon-coast": [[0,255,210],[20,130,255],[200,40,255],[255,70,155]],
  "ultraviolet": [[90,0,255],[200,30,255],[20,80,255],[245,245,255]],
  "ember": [[255,45,20],[255,120,15],[255,220,70],[120,10,15]]
};

["energy","audioResponse","motion","variation"].forEach(function(id){
  $(id).addEventListener("input", function(e){
    requested[id] = Number(e.target.value);
    $(id + "Value").value = e.target.value;
    renderState();
  });
});
$("couplingMode").addEventListener("change", function(e){ requested.couplingMode = e.target.value; renderState(); });
$("paletteId").addEventListener("change", function(e){ requested.paletteId = e.target.value; renderState(); });

function renderState(){
  $("requested").textContent = JSON.stringify(requested, null, 2);
  $("confirmed").textContent = JSON.stringify(confirmed, null, 2);
}
renderState();

const matrix = $("matrix"), mctx = matrix.getContext("2d");
const aux = $("aux"), actx = aux.getContext("2d");
const mw = 32, mh = 16;
let last = performance.now(), phase = 0, revision = 0;

function mix(a,b,t){ return a.map(function(v,i){ return Math.round(v + (b[i]-v)*t); }); }
function rgba(c,a){ return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
function paletteAt(t){
  const p = palettes[requested.paletteId];
  const x = (((t % 1) + 1) % 1) * (p.length - 1);
  const i = Math.floor(x), f = x - i;
  return mix(p[i], p[Math.min(i + 1, p.length - 1)], f);
}
function noise(x,y,t){ return (Math.sin(x*1.71+t*1.3)+Math.sin(y*2.11-t*.83)+Math.sin((x+y)*.63+t*1.9))/6+.5; }
function audio(now){
  const response = requested.audioResponse / 100;
  const bass = (Math.sin(now*.0017)+1)/2;
  const mids = (Math.sin(now*.0023+1.4)+1)/2;
  const treble = (Math.sin(now*.0037+3.2)+1)/2;
  const onset = Math.pow(Math.max(0,Math.sin(now*.0061)),8);
  return { bass:.12+bass*.7*response, mids:.1+mids*.66*response, treble:.08+treble*.6*response, onset:onset*response, motion:requested.motion/100 };
}
function drawMatrix(a){
  const cw = matrix.width/mw, ch = matrix.height/mh;
  const e = requested.energy/100, v = requested.variation/100;
  mctx.clearRect(0,0,matrix.width,matrix.height);
  for(let y=0;y<mh;y++) for(let x=0;x<mw;x++){
    const nx=x/(mw-1), ny=y/(mh-1);
    const wave=Math.sin((nx*4+ny*2)*Math.PI + phase*(.7+a.motion*1.8));
    const grain=noise(x*.32,y*.32,phase*(.3+v));
    const spectral=a.bass*(1-ny)+a.treble*ny+a.mids*(1-Math.abs(ny-.5)*2);
    const value=Math.max(0,Math.min(1,.15+e*.45+(wave*.5+.5)*.2+grain*v*.2+spectral*.2+a.onset*.12));
    const col=paletteAt(nx*.35+ny*.28+phase*.035*v+a.onset*.05);
    mctx.fillStyle=rgba(col,value);
    mctx.fillRect(x*cw+.8,y*ch+.8,cw-1.6,ch-1.6);
  }
}
function drawAux(a){
  const n=88,e=requested.energy/100,v=requested.variation/100;
  actx.clearRect(0,0,aux.width,aux.height);
  const w=aux.width/n;
  for(let i=0;i<n;i++){
    const p=i/(n-1);
    let source;
    if(requested.couplingMode==="locked") source=p*.35+phase*.035*v;
    else if(requested.couplingMode==="related") source=p*.55-phase*.025*v+a.bass*.05;
    else source=p*.9+phase*.08+a.treble*.12;
    const col=paletteAt(source);
    const pulse=.45+.35*Math.sin(i*.23+phase*(1+a.motion*2));
    const level=Math.max(.08,Math.min(1,.18+e*.5+pulse*.18+(a.bass+a.onset)*.18));
    actx.fillStyle=rgba(col,level);
    actx.fillRect(i*w,20,w+1,aux.height-40);
  }
}
function updateTelemetry(a){
  $("bass").value=a.bass; $("mids").value=a.mids; $("treble").value=a.treble; $("onset").value=a.onset;
  $("matrixMeta").textContent="requested semantic renderer · rev " + revision;
  $("auxMeta").textContent=requested.couplingMode.toUpperCase() + " coupling · rev " + revision;
}
function tick(now){
  const dt=Math.min(50,now-last); last=now;
  phase+=dt*.001*(.25+requested.motion/65);
  const a=audio(now);
  drawMatrix(a); drawAux(a); updateTelemetry(a);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Production integration must replace this pulse with real adapter acknowledgements.
setInterval(function(){
  revision++;
  const now=new Date().toLocaleTimeString();
  confirmed.matrix={confirmation:"mock",revision:revision,at:now};
  $("matrixAck").textContent="MOCK ACK · " + now;
  $("matrixAck").className="ack ok";
  setTimeout(function(){
    confirmed.aux={confirmation:"mock",revision:revision,at:new Date().toLocaleTimeString()};
    $("auxAck").textContent="MOCK ACK · " + confirmed.aux.at;
    $("auxAck").className="ack ok";
    renderState();
  },350);
  renderState();
},4000);
