import type { PublicEvent, PublicResult } from '../types';
import { buildCalendarFile } from './eventCalendar.mjs';

export { buildCalendarFile };

const PUBLIC_ORIGIN = 'https://localrootsdg.com';
const CALENDAR_ENCODER = new TextEncoder();

export const HBNF_EVENT_LINKS = [
  {label:'HBNF site',href:'https://hbnightflyers.com/'},
  {label:'UDisc',href:'https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule'},
  {label:'Instagram',href:'https://www.instagram.com/hbnightflyers/'},
  {label:'Facebook',href:'https://www.facebook.com/HBNightFlyers/'},
] as const;

export function isHbnfEvent(event:Pick<PublicEvent,'name'|'club_host'>) {
  return event.club_host==='HB Night Flyers'||event.name.startsWith('HB Night Flyers');
}

export const eventTitle = (value: string) => value.replaceAll('_',' ').replace(/\b\w/g,(match)=>match.toUpperCase());

export function eventDateRange(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`), b = new Date(`${end}T12:00:00Z`);
  const short = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const full = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  return start===end ? full.format(a) : `${short.format(a)}–${full.format(b)}`;
}

export function pacificToday() {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function resultValue(result: PublicResult) {
  if(result.to_par!=null)return `${result.to_par>0?'+':''}${result.to_par}`;
  if(result.total_score!=null)return String(result.total_score);
  if(result.points!=null){
    if(result.division_code==='SKINS')return `${result.points} skin${result.points===1?'':'s'}`;
    return String(result.points);
  }
  return '—';
}

export function hasResults(event: PublicEvent) {
  return Boolean(event.top_results?.length || event.results_url);
}

export function resultsLinkLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./,'').toLowerCase();
    if(host==='pdga.com'||host.endsWith('.pdga.com'))return 'PDGA Results';
    if(host==='discgolfscene.com'||host.endsWith('.discgolfscene.com'))return 'Disc Golf Scene Results';
    if(host==='udisc.com'||host.endsWith('.udisc.com'))return 'UDisc Results';
    if(host==='hbnightflyers.com'||host.endsWith('.hbnightflyers.com'))return 'HBNF Results';
  } catch {
    // Keep the safe generic label for malformed legacy URLs.
  }
  return 'Official Results';
}

export function eventDetailPath(event: Pick<PublicEvent,'slug'>) {
  return `/events/${encodeURIComponent(event.slug)}`;
}

export function eventTimeLabel(event: Pick<PublicEvent,'start_date'|'start_time_local'|'checkin_time_local'|'end_time_local'|'start_time_note'|'timezone'>) {
  if (!event.start_time_local && !event.checkin_time_local && !event.start_time_note) return null;
  const format = (value: string) => {
    const [hourText, minuteText] = value.split(':');
    const hour = Number(hourText);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minuteText}${suffix}`;
  };
  const dateAnchor = new Date(`${event.start_date}T12:00:00Z`);
  let zone = '';
  try {
    zone = new Intl.DateTimeFormat('en-US', { timeZone: event.timezone, timeZoneName: 'short' })
      .formatToParts(dateAnchor).find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return null;
  }
  const range = event.start_time_local && event.end_time_local
    ? `${format(event.start_time_local)}–${format(event.end_time_local)}`
    : event.start_time_local ? format(event.start_time_local) : event.start_time_note ?? '';
  const label = [event.checkin_time_local ? `Check-in ${format(event.checkin_time_local)}` : '', range ? `Start ${range}` : ''].filter(Boolean).join(' · ');
  return zone ? `${label} ${zone}` : label;
}

export function eventFeeLabel(event: Pick<PublicEvent,'entry_fee_amount'|'entry_fee_currency'|'entry_fee_unit'|'additional_fees_note'>) {
  if (event.entry_fee_amount == null) return null;
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: event.entry_fee_currency || 'USD', maximumFractionDigits: 2,
  }).format(event.entry_fee_amount);
  const unit = event.entry_fee_unit ? ` / ${event.entry_fee_unit}` : '';
  return `${amount}${unit}${event.additional_fees_note ? ` · ${event.additional_fees_note}` : ''}`;
}

export function downloadEventCalendar(event: PublicEvent) {
  const blob=new Blob([buildCalendarFile(event)],{type:'text/calendar;charset=utf-8'});
  const href=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=href;
  anchor.download=`${event.slug||'local-roots-event'}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(href),0);
}
