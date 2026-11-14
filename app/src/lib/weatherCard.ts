export type WeatherCardData = {
  course: string;
  place: string;
  period: string;
  tempRange: string;
  conditions: string;
  wind: string;
  gust: string;
  rain: string;
  flags: string[];
  issued: string;
  host: string;
};

const FONT = '"Avenir Next",Avenir,"Helvetica Neue",Arial,sans-serif';
const W = 1080;
const H = 1350;

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

export async function renderWeatherCard(data: WeatherCardData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const logo = await loadLogo('/brand/local-roots-lr.svg');

  ctx.fillStyle = '#f4ecdf'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a2618'; ctx.fillRect(0, 0, W, 190);
  if (logo) {
    const lh = 120, lw = lh * (245 / 263);
    ctx.save();
    ctx.fillStyle = '#fbf5ea'; rr(ctx, 56, 35, lw + 24, lh + 24, 18); ctx.fill();
    ctx.drawImage(logo, 68, 47, lw, lh);
    ctx.restore();
  }
  ctx.fillStyle = '#fbf5ea'; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 40px ' + FONT; ctx.fillText('LOCAL ROOTS', 250, 92);
  ctx.font = '600 30px ' + FONT; ctx.fillStyle = '#d7c2a3'; ctx.fillText('Disc Golf Weather', 250, 138);

  let y = 290;
  ctx.fillStyle = '#3a2618'; ctx.font = '800 68px ' + FONT;
  const nameLines = wrap(ctx, data.course, W - 112, 2);
  for (const line of nameLines) { ctx.fillText(line, 56, y); y += 78; }
  ctx.font = '600 36px ' + FONT; ctx.fillStyle = '#5b3a24';
  ctx.fillText(data.place, 56, y - 8); y += 54;
  ctx.font = '700 38px ' + FONT; ctx.fillStyle = '#9f5c36';
  ctx.fillText(data.period, 56, y); y += 34;

  ctx.fillStyle = '#fbf5ea'; rr(ctx, 56, y, W - 112, 250, 28); ctx.fill();
  ctx.strokeStyle = 'rgba(91,58,36,.25)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#3a2618'; ctx.font = '800 118px ' + FONT;
  ctx.fillText(data.tempRange, 96, y + 140);
  ctx.font = '600 38px ' + FONT; ctx.fillStyle = '#5b3a24';
  const cl = wrap(ctx, data.conditions, W - 192, 1);
  ctx.fillText(cl[0] || '', 96, y + 208);
  y += 250 + 30;

  const boxW = (W - 112 - 40) / 3;
  const stats: Array<[string, string]> = [['WIND', data.wind], ['GUST', data.gust], ['RAIN', data.rain]];
  stats.forEach((s, i) => {
    const x = 56 + i * (boxW + 20);
    ctx.fillStyle = '#efe2d1'; rr(ctx, x, y, boxW, 190, 24); ctx.fill();
    ctx.fillStyle = '#756050'; ctx.font = '700 28px ' + FONT; ctx.fillText(s[0], x + 28, y + 56);
    ctx.fillStyle = '#3a2618'; ctx.font = '800 50px ' + FONT;
    let size = 50;
    while (ctx.measureText(s[1]).width > boxW - 56 && size > 28) { size -= 2; ctx.font = '800 ' + size + 'px ' + FONT; }
    ctx.fillText(s[1], x + 28, y + 136);
  });
  y += 190 + 34;

  if (data.flags.length) {
    ctx.font = '700 32px ' + FONT;
    let x = 56;
    for (const flag of data.flags.slice(0, 4)) {
      const w = ctx.measureText(flag).width + 48;
      if (x + w > W - 56) { x = 56; y += 78; }
      ctx.fillStyle = '#83482d'; rr(ctx, x, y, w, 62, 31); ctx.fill();
      ctx.fillStyle = '#fbf5ea'; ctx.fillText(flag, x + 24, y + 42);
      x += w + 14;
    }
    y += 62;
  }

  const fy = Math.max(1080, y + 70);
  ctx.fillStyle = '#3a2618'; ctx.fillRect(0, fy, W, 120);
  ctx.fillStyle = '#fbf5ea'; ctx.font = '700 38px ' + FONT; ctx.fillText(data.host, 56, fy + 70);
  ctx.fillStyle = '#d7c2a3'; ctx.font = '600 28px ' + FONT; ctx.textAlign = 'right';
  ctx.fillText(data.issued, W - 56, fy + 70); ctx.textAlign = 'left';
  const out = document.createElement('canvas');
  out.width = W; out.height = fy + 120;
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
