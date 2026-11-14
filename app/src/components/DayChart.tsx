import { useState, type PointerEvent } from 'react';
import { AXIS_TICKS, finite, rangeText, type ChartHour, type DaySun } from '../lib/dayChart';
import { formatMinutes } from '../lib/sun.js';

const W = 480, PAD = 10, PW = W - PAD * 2;
const x = (minute: number) => PAD + (minute / 1440) * PW;
const COL = PW / 24;

type Kind = 'temp' | 'wind' | 'rain';

function Night({ sun, top, height }: { sun: DaySun; top: number; height: number }) {
  if (!sun) return null;
  return <g className="dc-night"><rect x={PAD} y={top} width={Math.max(0, x(sun.sunriseMin) - PAD)} height={height} /><rect x={x(sun.sunsetMin)} y={top} width={Math.max(0, PAD + PW - x(sun.sunsetMin))} height={height} /></g>;
}

function Track({ kind, hours, sun, title, value, height, showAxis }: { kind: Kind; hours: ChartHour[]; sun: DaySun; title: string; value: string; height: number; showAxis?: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  const top = 30, plotH = height, bottom = top + plotH, total = bottom + (showAxis ? 28 : 10);
  const temps = hours.map(h => h.tempF), winds = hours.map(h => h.windMph), gusts = hours.map(h => h.gustMph), rains = hours.map(h => h.rain);
  const tn = finite(temps), lo = tn.length ? Math.min(...tn) : 0, hi = tn.length ? Math.max(...tn) : 0, span = Math.max(hi - lo, 6);
  const maxWind = Math.max(25, ...finite(winds), ...finite(gusts));
  const cx = (h: ChartHour) => x(h.minute) + COL / 2;
  const ty = (v: number) => bottom - 18 - ((v - lo) / span) * (plotH - 40);
  const rainPeak = finite(rains).length ? Math.max(...finite(rains)) : null;
  const peakIdx = rainPeak !== null && rainPeak > 0 ? rains.indexOf(rainPeak) : -1;

  function pick(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = -1, dist = Infinity;
    hours.forEach((h, i) => { const d = Math.abs(cx(h) - px); if (d < dist) { dist = d; best = i; } });
    if (best >= 0) setSel(best);
  }
  const hour = sel !== null ? hours[sel] : null;
  let readout = '';
  if (hour) {
    readout = kind === 'temp' ? (hour.tempF === null ? '—' : `${Math.round(hour.tempF)}°F`)
      : kind === 'wind' ? (hour.windMph === null ? '—' : `${Math.round(hour.windMph)} mph${hour.gustMph !== null && hour.gustMph > (hour.windMph ?? 0) ? ` · gust ${Math.round(hour.gustMph)}` : ''}`)
      : (hour.rain === null ? '—' : `${Math.round(hour.rain)}%`);
    readout = `${hour.label} · ${readout}`;
  }
  const boxW = Math.max(110, readout.length * 8.4 + 20);

  return <div className={`dc-track dc-${kind}`}>
    <svg viewBox={`0 0 ${W} ${total}`} role="img" aria-label={`${title} ${value}`} onPointerDown={e => { pick(e); }} onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons) pick(e); }} onPointerLeave={e => { if (e.pointerType === 'mouse') setSel(null); }}>
      <text className="dc-title" x={PAD} y={18}>{title}</text>
      {hour ? null : <text className="dc-value" x={W - PAD} y={18} textAnchor="end">{value}</text>}
      <rect className="dc-plot" x={PAD} y={top} width={PW} height={plotH} rx={6} />
      <Night sun={sun} top={top} height={plotH} />
      {kind === 'temp' && tn.length ? <>
        <path className="dc-line" d={hours.map((h, i) => h.tempF === null ? '' : `${hours.slice(0, i).some(p => p.tempF !== null) && hours[i - 1]?.tempF !== null ? 'L' : 'M'}${cx(h).toFixed(1)},${ty(h.tempF).toFixed(1)}`).join('')} />
        {[hours[temps.indexOf(hi)], hours[temps.indexOf(lo)]].filter((h, i, a) => a.indexOf(h) === i).map((h, i) => {
          const isHi = h.tempF === hi && i === 0;
          return <g key={i}><circle className="dc-dot" cx={cx(h)} cy={ty(h.tempF as number)} r={4.5} /><text className="dc-label" x={Math.min(Math.max(cx(h), PAD + 18), PAD + PW - 18)} y={ty(h.tempF as number) + (isHi ? -10 : 20)} textAnchor="middle">{Math.round(h.tempF as number)}°</text></g>;
        })}
      </> : null}
      {kind === 'wind' ? hours.map((h, i) => {
        if (h.windMph === null) return null;
        const bh = Math.max(2, (h.windMph / maxWind) * (plotH - 8)), bw = COL * 0.66;
        const g = h.gustMph;
        return <g key={i}><rect className="dc-bar-wind" x={cx(h) - bw / 2} y={bottom - bh} width={bw} height={bh} />{g !== null && g > h.windMph ? <rect className="dc-gust" x={cx(h) - bw / 2} y={bottom - (g / maxWind) * (plotH - 8) - 2} width={bw} height={2.5} /> : null}</g>;
      }) : null}
      {kind === 'rain' ? <>
        {hours.map((h, i) => {
          if (h.rain === null) return null;
          const bh = h.rain <= 0 ? 0 : Math.max(2, (h.rain / 100) * (plotH - 8)), bw = COL * 0.66;
          return <rect key={i} className="dc-bar-rain" x={cx(h) - bw / 2} y={bottom - bh} width={bw} height={bh} />;
        })}
        {peakIdx >= 0 ? <text className="dc-label" x={Math.min(Math.max(cx(hours[peakIdx]), PAD + 18), PAD + PW - 18)} y={Math.max(top + 12, bottom - ((rainPeak as number) / 100) * (plotH - 8) - 5)} textAnchor="middle">{Math.round(rainPeak as number)}%</text> : null}
      </> : null}
      {hour ? <g className="dc-readout">
        <line x1={cx(hour)} x2={cx(hour)} y1={top} y2={bottom} />
        <rect x={PAD + PW - boxW} y={2} width={boxW} height={24} rx={7} />
        <text x={PAD + PW - boxW / 2} y={19} textAnchor="middle">{readout}</text>
      </g> : null}
      {showAxis ? AXIS_TICKS.map(t => <text key={t.minute} className="dc-axis" x={x(t.minute) + (t.minute === 0 ? 2 : 0)} y={bottom + 20} textAnchor={t.minute === 0 ? 'start' : 'middle'}>{t.label}</text>) : null}
    </svg>
  </div>;
}

function SunStrip({ sun }: { sun: NonNullable<DaySun> }) {
  const rise = x(sun.sunriseMin), set = x(sun.sunsetMin);
  const anchor = (px: number) => Math.min(Math.max(px, PAD + 34), PAD + PW - 34);
  return <div className="dc-track dc-sun"><svg viewBox={`0 0 ${W} 58`} role="img" aria-label={`Sunrise ${formatMinutes(sun.sunriseMin)}, sunset ${formatMinutes(sun.sunsetMin)}`}>
    <text className="dc-sun-cap" x={anchor(rise)} y={12} textAnchor="middle">Sunrise</text>
    <text className="dc-sun-text" x={anchor(rise)} y={30} textAnchor="middle">{formatMinutes(sun.sunriseMin)}</text>
    <text className="dc-sun-cap" x={anchor(set)} y={12} textAnchor="middle">Sunset</text>
    <text className="dc-sun-text" x={anchor(set)} y={30} textAnchor="middle">{formatMinutes(sun.sunsetMin)}</text>
    <rect className="dc-sun-night" x={PAD} y={40} width={PW} height={10} rx={5} />
    <rect className="dc-sun-day" x={rise} y={40} width={Math.max(0, set - rise)} height={10} />
    <circle className="dc-sun-glyph" cx={rise} cy={45} r={7} /><circle className="dc-sun-glyph" cx={set} cy={45} r={7} />
  </svg></div>;
}

export function DayChart({ hours, sun, label }: { hours: ChartHour[]; sun: DaySun; label: string }) {
  const winds = hours.map(h => h.windMph), gusts = hours.map(h => h.gustMph), rains = hours.map(h => h.rain);
  const gustMax = finite(gusts).length ? Math.round(Math.max(...finite(gusts))) : null;
  const rainPeak = finite(rains).length ? Math.round(Math.max(...finite(rains))) : null;
  return <div className="weather-daychart" role="group" aria-label={label}>
    {sun ? <SunStrip sun={sun} /> : null}
    <Track kind="temp" hours={hours} sun={sun} title="Temp" value={rangeText(hours.map(h => h.tempF), '°F')} height={120} />
    <Track kind="wind" hours={hours} sun={sun} title="Wind" value={`${rangeText(winds, ' mph')}${gustMax !== null ? ` · gust ${gustMax}` : ''}`} height={80} />
    <Track kind="rain" hours={hours} sun={sun} title="Rain" value={rainPeak === null ? '—' : rainPeak > 0 ? `peak ${rainPeak}%` : 'none forecast'} height={80} showAxis />
  </div>;
}
