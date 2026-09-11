import type { PublicEvent, PublicResult } from '../types';

const PUBLIC_ORIGIN = 'https://localrootsdg.com';

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
    if(host==='pdga.com'||host.endsWith('.pdga.com'))return 'View PDGA results';
    if(host==='discgolfscene.com'||host.endsWith('.discgolfscene.com'))return 'View Disc Golf Scene results';
    if(host==='udisc.com'||host.endsWith('.udisc.com'))return 'View UDisc results';
    if(host==='hbnightflyers.com'||host.endsWith('.hbnightflyers.com'))return 'View HBNF results';
  } catch {
    // Keep the safe generic label for malformed legacy URLs.
  }
  return 'View official results';
}

export function eventDetailPath(event: Pick<PublicEvent,'slug'>) {
  return `/events/${encodeURIComponent(event.slug)}`;
}

function calendarDate(value: string) {
  return value.replaceAll('-','');
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
}

export function buildCalendarFile(event: PublicEvent) {
  const detailUrl=`${PUBLIC_ORIGIN}${eventDetailPath(event)}`;
  const location=[event.course_name||event.venue_name,event.city,event.county?`${event.county} County`:null].filter(Boolean).join(', ');
  const description=[event.club_host?`Hosted by ${event.club_host}`:null,event.td_names?.length?`TD: ${event.td_names.join(', ')}`:null,`Event details: ${detailUrl}`].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Local Roots//Disc Golf Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@localrootsdg.com`,
    `DTSTART;VALUE=DATE:${calendarDate(event.start_date)}`,
    `DTEND;VALUE=DATE:${calendarDate(addDays(event.end_date,1))}`,
    `SUMMARY:${escapeCalendarText(event.name)}`,
    location?`LOCATION:${escapeCalendarText(location)}`:null,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `URL:${detailUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].filter(line=>line!=null).join('\r\n');
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
