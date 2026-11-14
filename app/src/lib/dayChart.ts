import type { HourRow } from './weatherCore.js';

export type ChartHour = { minute: number; label: string; tempF: number | null; windMph: number | null; gustMph: number | null; rain: number | null };
export type DaySun = { sunriseMin: number; sunsetMin: number } | null;

export function toChartHours(rows: HourRow[], timeZone: string): ChartHour[] {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
  return rows.map(r => {
    const parts = fmt.formatToParts(new Date(r.startTime));
    const h = Number(parts.find(p => p.type === 'hour')?.value), m = Number(parts.find(p => p.type === 'minute')?.value);
    return { minute: h * 60 + m, label: `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`, tempF: r.temperatureF, windMph: r.windMaxMph, gustMph: r.gustMph, rain: r.precipitationProbability };
  });
}

export const finite = (values: Array<number | null>) => values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
export function rangeText(values: Array<number | null>, unit: string) {
  const n = finite(values);
  if (!n.length) return '—';
  const lo = Math.round(Math.min(...n)), hi = Math.round(Math.max(...n));
  return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`;
}
export const AXIS_TICKS = [{ minute: 0, label: '12 AM' }, { minute: 360, label: '6 AM' }, { minute: 720, label: '12 PM' }, { minute: 1080, label: '6 PM' }];
