import { formatMinutes } from './sun.js';
export type CardHour = { minute: number; label: string; tempF: number | null; windMph: number | null; gustMph: number | null; rain: number | null };
export type WeatherCardData = {
  course: string;
  place: string;
  period: string;
  conditions: string;
  hours: CardHour[];
  sun: { sunriseMin: number; sunsetMin: number } | null;
  flags: string[];
  checked: string;
  host: string;
};

const FONT = '"Avenir Next",Avenir,"Helvetica Neue",Arial,sans-serif';
const W = 1080;
const INK = '#3a2618', SOIL = '#5b3a24', CLAY = '#9f5c36', RUST = '#83482d', PAPER = '#fbf5ea', SAND = '#efe2d1', MUTED = '#756050', SAGE = '#7f8962', BLUE = '#5a7384';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}

function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const nums = (values: Array<number | null>) => values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
const range = (values: Array<number | null>, unit: string) => {
  const n = nums(values);
  if (!n.length) return '—';
  const lo = Math.round(Math.min(...n)), hi = Math.round(Math.max(...n));
  return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`;
};

export async function renderWeatherCard(data: WeatherCardData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = 2000;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const logo = await loadLogo('/brand/local-roots-lr.svg');

  ctx.fillStyle = '#f4ecdf'; ctx.fillRect(0, 0, W, 2000);
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, 190);
  if (logo) {
    const lh = 120, lw = lh * (245 / 263);
    ctx.fillStyle = PAPER; rr(ctx, 56, 35, lw + 24, lh + 24, 18); ctx.fill();
    ctx.drawImage(logo, 68, 47, lw, lh);
  }
  ctx.fillStyle = PAPER; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 40px ' + FONT; ctx.fillText('LOCAL ROOTS', 250, 92);
  ctx.font = '600 30px ' + FONT; ctx.fillStyle = '#d7c2a3'; ctx.fillText('Disc Golf Weather', 250, 138);

  let y = 286;
  ctx.fillStyle = INK; ctx.font = '800 64px ' + FONT;
  for (const line of wrap(ctx, data.course, W - 112, 2)) { ctx.fillText(line, 56, y); y += 74; }
  ctx.font = '600 34px ' + FONT; ctx.fillStyle = SOIL; ctx.fillText(data.place, 56, y - 10); y += 46;
  ctx.font = '800 44px ' + FONT; ctx.fillStyle = CLAY; ctx.fillText(data.period, 56, y); y += 24;

  const hrs = data.hours;
  const temps = hrs.map(h => h.tempF), winds = hrs.map(h => h.windMph), gusts = hrs.map(h => h.gustMph), rains = hrs.map(h => h.rain);
  const rainNums = nums(rains);
  const rainPeak = rainNums.length ? Math.max(...rainNums) : null;
  const peakIdx = rainPeak !== null && rainPeak > 0 ? rains.indexOf(rainPeak) : -1;

  y += 22;
  const gw = (W - 112 - 3 * 16) / 4;
  const tiles: Array<[string, string]> = [
    ['TEMP', range(temps, '°')],
    ['WIND', range(winds, '')],
    ['GUST', nums(gusts).length ? `${Math.round(Math.max(...nums(gusts)))}` : '—'],
    ['RAIN', rainPeak === null ? '—' : `${Math.round(rainPeak)}%`],
  ];
  tiles.forEach((t, i) => {
    const x = 56 + i * (gw + 16);
    ctx.fillStyle = PAPER; rr(ctx, x, y, gw, 150, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(91,58,36,.22)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = MUTED; ctx.font = '700 24px ' + FONT; ctx.fillText(t[0], x + 22, y + 44);
    let size = 54; ctx.font = '800 ' + size + 'px ' + FONT;
    while (ctx.measureText(t[1]).width > gw - 44 && size > 28) { size -= 2; ctx.font = '800 ' + size + 'px ' + FONT; }
    ctx.fillStyle = INK; ctx.fillText(t[1], x + 22, y + 108);
    const unit = i === 1 || i === 2 ? 'mph' : i === 0 ? '°F' : (peakIdx >= 0 ? 'peak ' + hrs[peakIdx].label : 'peak');
    ctx.fillStyle = MUTED; ctx.font = '600 22px ' + FONT;
    const w0 = ctx.measureText(t[1]).width; ctx.font = '800 ' + size + 'px ' + FONT; const w1 = ctx.measureText(t[1]).width; ctx.font = '600 22px ' + FONT;
    void w0;
    if (x + 22 + w1 + 8 + ctx.measureText(unit).width < x + gw - 10) ctx.fillText(unit, x + 22 + w1 + 8, y + 108);
  });
  y += 150 + 18;

  if (data.conditions) {
    ctx.fillStyle = SOIL; ctx.font = '600 32px ' + FONT;
    ctx.fillText(wrap(ctx, data.conditions, W - 112, 1)[0], 56, y + 28); y += 52;
  }

  const n = hrs.length;
  const panelX = 56, panelW = W - 112, padX = 30;
  const plotX = panelX + padX, plotW = panelW - padX * 2, col = plotW / 24;
  const mx = (minute: number) => plotX + (minute / 1440) * plotW;
  const sun = data.sun;
  if (sun && n) {
    const rise = mx(sun.sunriseMin), set = mx(sun.sunsetMin);
    const anchor = (px: number) => Math.min(Math.max(px, plotX + 80), plotX + plotW - 80);
    ctx.textAlign = 'center';
    for (const [px, cap, time] of [[rise, 'SUNRISE', formatMinutes(sun.sunriseMin)], [set, 'SUNSET', formatMinutes(sun.sunsetMin)]] as Array<[number, string, string]>) {
      ctx.fillStyle = MUTED; ctx.font = '700 22px ' + FONT; ctx.fillText(cap, anchor(px), y + 22);
      ctx.fillStyle = INK; ctx.font = '800 32px ' + FONT; ctx.fillText(time, anchor(px), y + 60);
    }
    ctx.textAlign = 'left';
    const by = y + 80;
    ctx.fillStyle = '#cdbfae'; rr(ctx, plotX, by, plotW, 18, 9); ctx.fill();
    ctx.fillStyle = '#f0d28a'; ctx.fillRect(rise, by, Math.max(0, set - rise), 18);
    for (const sx of [rise, set]) { ctx.fillStyle = '#e0a526'; ctx.beginPath(); ctx.arc(sx, by + 9, 13, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = PAPER; ctx.lineWidth = 3; ctx.stroke(); }
    y += 126;
  }
  if (!n) {
    ctx.fillStyle = SOIL; ctx.font = '700 38px ' + FONT; ctx.fillText('No forecast available', 56, y + 70); y += 110;
  }
  if (n) {
    const tracks = [
      { title: 'TEMP', value: range(temps, '°F'), h: 170 },
      { title: 'WIND', value: range(winds, ' mph') + (nums(gusts).length ? `  ·  gust ${Math.round(Math.max(...nums(gusts)))}` : ''), h: 110 },
      { title: 'RAIN', value: rainPeak === null ? '—' : (rainPeak > 0 ? `peak ${Math.round(rainPeak)}% at ${hrs[peakIdx].label}` : 'none forecast'), h: 110 },
    ];
    const panelH = 30 + tracks.reduce((a, t) => a + t.h + 76, 0) + 44;
    ctx.fillStyle = PAPER; rr(ctx, panelX, y, panelW, panelH, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(91,58,36,.22)'; ctx.lineWidth = 2; ctx.stroke();
    let ty = y + 30;
    const colX = (i: number) => mx(hrs[i].minute) + col / 2;
    const gridLine = (yy: number) => { ctx.strokeStyle = 'rgba(91,58,36,.14)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(plotX, yy); ctx.lineTo(plotX + plotW, yy); ctx.stroke(); };
    for (const tr of tracks) {
      ctx.fillStyle = MUTED; ctx.font = '700 24px ' + FONT; ctx.textAlign = 'left'; ctx.fillText(tr.title, plotX, ty + 28);
      ctx.fillStyle = INK; ctx.font = '700 26px ' + FONT; ctx.textAlign = 'right'; ctx.fillText(tr.value, plotX + plotW, ty + 28); ctx.textAlign = 'left';
      const top = ty + 50, bot = top + tr.h;
      if (sun) {
        ctx.fillStyle = 'rgba(58,38,24,.09)';
        ctx.fillRect(plotX, top, Math.max(0, mx(sun.sunriseMin) - plotX), tr.h);
        ctx.fillRect(mx(sun.sunsetMin), top, Math.max(0, plotX + plotW - mx(sun.sunsetMin)), tr.h);
      }
      if (tr.title === 'TEMP') {
        const tn = nums(temps);
        if (tn.length) {
          const lo = Math.min(...tn), hi = Math.max(...tn), span = Math.max(hi - lo, 6);
          const py = (v: number) => bot - 44 - ((v - lo) / span) * (tr.h - 88);
          gridLine(bot);
          ctx.strokeStyle = CLAY; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.beginPath();
          let started = false;
          temps.forEach((v, i) => { if (v === null) { started = false; return; } if (!started) { ctx.moveTo(colX(i), py(v)); started = true; } else ctx.lineTo(colX(i), py(v)); });
          ctx.stroke();
          const hiI = temps.indexOf(hi), loI = temps.indexOf(lo);
          ctx.font = '700 26px ' + FONT; ctx.textAlign = 'center';
          for (const [idx, v, above] of [[hiI, hi, true], [loI, lo, false]] as Array<[number, number, boolean]>) {
            if (hiI === loI && !above) continue;
            ctx.fillStyle = CLAY; ctx.beginPath(); ctx.arc(colX(idx), py(v), 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = INK;
            const tx = Math.min(Math.max(colX(idx), plotX + 24), plotX + plotW - 24);
            ctx.fillText(`${Math.round(v)}°`, tx, above ? py(v) - 16 : py(v) + 36);
          }
          ctx.textAlign = 'left';
        }
      } else if (tr.title === 'WIND') {
        const gm = nums(gusts), wm = nums(winds);
        const maxV = Math.max(25, ...(gm.length ? gm : [0]), ...(wm.length ? wm : [0]));
        gridLine(bot);
        const bw = Math.max(3, col * 0.62);
        winds.forEach((v, i) => {
          if (v === null) return;
          const hh = Math.max(3, (v / maxV) * (tr.h - 10));
          ctx.fillStyle = SAGE; ctx.fillRect(colX(i) - bw / 2, bot - hh, bw, hh);
          const g = gusts[i];
          if (g !== null && g > v) { const gy = bot - (g / maxV) * (tr.h - 10); ctx.fillStyle = INK; ctx.fillRect(colX(i) - bw / 2, gy - 3, bw, 4); }
        });
      } else {
        gridLine(bot);
        const bw = Math.max(3, col * 0.62);
        rains.forEach((v, i) => {
          if (v === null) return;
          const hh = v <= 0 ? 0 : Math.max(4, (v / 100) * (tr.h - 10));
          ctx.fillStyle = BLUE; ctx.fillRect(colX(i) - bw / 2, bot - hh, bw, hh);
        });
        if (peakIdx >= 0) {
          ctx.fillStyle = INK; ctx.font = '700 24px ' + FONT; ctx.textAlign = 'center';
          const tx = Math.min(Math.max(colX(peakIdx), plotX + 30), plotX + plotW - 30);
          ctx.fillText(`${Math.round(rainPeak as number)}%`, tx, Math.max(top + 14, bot - ((rainPeak as number) / 100) * (tr.h - 10) - 10));
          ctx.textAlign = 'left';
        }
      }
      ty = bot + 26;
    }
    ctx.fillStyle = MUTED; ctx.font = '600 24px ' + FONT;
    for (const t of [{ m: 0, l: '12 AM' }, { m: 360, l: '6 AM' }, { m: 720, l: '12 PM' }, { m: 1080, l: '6 PM' }]) { ctx.textAlign = t.m === 0 ? 'left' : 'center'; ctx.fillText(t.l, mx(t.m), ty + 30); }
    ctx.textAlign = 'left';
    y += panelH + 24;
  }

  if (data.flags.length) {
    ctx.font = '700 30px ' + FONT;
    let x = 56;
    for (const flag of data.flags.slice(0, 4)) {
      const w = ctx.measureText(flag).width + 44;
      if (x + w > W - 56) { x = 56; y += 74; }
      ctx.fillStyle = RUST; rr(ctx, x, y, w, 58, 29); ctx.fill();
      ctx.fillStyle = PAPER; ctx.fillText(flag, x + 22, y + 39);
      x += w + 12;
    }
    y += 58 + 20;
  }

  const fy = y + 26;
  ctx.fillStyle = INK; ctx.fillRect(0, fy, W, 116);
  ctx.fillStyle = PAPER; ctx.font = '700 36px ' + FONT; ctx.fillText(data.host, 56, fy + 68);
  ctx.fillStyle = '#d7c2a3'; ctx.font = '600 26px ' + FONT; ctx.textAlign = 'right';
  ctx.fillText(data.checked, W - 56, fy + 68); ctx.textAlign = 'left';
  const out = document.createElement('canvas');
  out.width = W; out.height = fy + 116;
  (out.getContext('2d') as CanvasRenderingContext2D).drawImage(canvas, 0, 0);
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    if (canvas.toBlob) { canvas.toBlob(blob => resolve(blob), 'image/png'); return; }
    try {
      const url = canvas.toDataURL('image/png');
      const bin = atob(url.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type: 'image/png' }));
    } catch { resolve(null); }
  });
}
