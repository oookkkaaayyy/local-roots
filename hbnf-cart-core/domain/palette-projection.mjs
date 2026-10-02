const LEGACY_IDS = new Set(["hbnf-balanced","copper","ocean"]);

export function canonicalPaletteTarget(id) {
  const value=String(id||"");
  const wled=value.match(/^wled-(\d{1,3})$/);
  if (wled) {
    const palette=Number(wled[1]);
    if (palette>=0 && palette<=255) return {kind:"palette",palette};
    return null;
  }
  const solid=value.match(/^solid-([0-9A-Fa-f]{6})$/);
  if (solid) return {kind:"solid",palette:0,color:"#"+solid[1].toUpperCase()};
  if (LEGACY_IDS.has(value)) return {kind:"legacy",palette:null};
  return null;
}

export function canonicalPaletteCommand(id, telemetry={}) {
  const target=canonicalPaletteTarget(id);
  if (!target) throw new Error("unsupported canonical palette id");
  if (target.kind==="legacy") return {kind:"legacy",command:null};
  const clamp=(value,min,max,fallback)=>{
    const n=Number(value);
    return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;
  };
  const command={
    action:"effect",
    effect:clamp(telemetry.effect,0,254,0),
    speed:clamp(telemetry.speed,0,255,128),
    intensity:clamp(telemetry.intensity,0,255,128),
    palette:target.palette,
    loadDefaults:false,
  };
  if (target.kind==="solid") command.primaryColor=target.color;
  return {kind:target.kind,command};
}

export function paletteReadbackMatches(id, telemetry={}) {
  const target=canonicalPaletteTarget(id);
  if (!target) return false;
  if (target.kind==="legacy") return true;
  if (Number(telemetry.palette)!==Number(target.palette)) return false;
  if (target.kind!=="solid") return true;
  const rgb=Array.isArray(telemetry.color)?telemetry.color.slice(0,3):[];
  if (rgb.length<3) return false;
  const hex="#"+rgb.map(v=>Math.max(0,Math.min(255,Math.round(Number(v)||0))).toString(16).padStart(2,"0")).join("").toUpperCase();
  return hex===target.color;
}
