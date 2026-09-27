import { FormEvent, useEffect, useMemo, useState } from 'react';
import { callFunction, supabase } from '../lib/supabase';
import { downloadEventCalendar, eventDateRange, eventDetailPath, eventTitle, HBNF_EVENT_LINKS, isHbnfEvent, pacificToday, resultValue, resultsLinkLabel } from '../lib/eventPresentation';
import { Shell } from '../components/Shell';
import type { PublicEvent } from '../types';

const COUNTIES = ['Ventura', 'Los Angeles', 'Orange', 'Riverside', 'San Bernardino', 'San Diego'];
const EVENT_TYPES = [
  ['tournament','Tournament'],['flex_start','Flex start'],['league','League'],['doubles','Doubles'],['team','Team'],
  ['putting','Putting'],['ace_race','Ace race'],['circuit_challenge','Circuit challenge'],['tag_match','Tag match'],
  ['clinic','Clinic'],['charity','Charity'],['community','Community'],['other','Other'],
] as const;

type EventView = 'upcoming' | 'results';
type ResultsFilter = 'all' | 'local' | 'official';
type EventFilters = {
  view: EventView;
  query: string;
  county: string;
  sanction: string;
  eventType: string;
  month: string;
  results: ResultsFilter;
};

const monthKey = (v: string) => v.slice(0,7);
function monthLabel(key: string) {
  const [y,m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1,12)));
}
function readEventFilters(): EventFilters {
  const defaults: EventFilters = {view:'upcoming',query:'',county:'all',sanction:'all',eventType:'all',month:'all',results:'all'};
  if(typeof window==='undefined')return defaults;
  const params = new URLSearchParams(window.location.search);
  const county = params.get('county');
  const sanction = params.get('sanction');
  const eventType = params.get('type');
  const month = params.get('month');
  const resultParam=params.get('results');
  return {
    view: params.get('view')==='results'?'results':'upcoming',
    query: params.get('q')??'',
    county: county && COUNTIES.includes(county)?county:'all',
    sanction: sanction==='yes'||sanction==='no'?sanction:'all',
    eventType: eventType && EVENT_TYPES.some(([value])=>value===eventType)?eventType:'all',
    month: month && /^\d{4}-\d{2}$/.test(month)?month:'all',
    results: resultParam==='local'||resultParam==='official'?resultParam:'all',
  };
}
function currentEventsPath(){
  if(typeof window==='undefined')return '/events';
  return `${window.location.pathname}${window.location.search}`;
}

function EventCard({event,today}:{event:PublicEvent;today:string}) {
  const stale = Boolean(event.last_verified_at && Date.now()-new Date(event.last_verified_at).getTime()>14*86400000);
  const effectiveStatus = ['canceled','completed'].includes(event.status) ? event.status : event.end_date<today ? 'completed' : event.status;
  const canShowRegistration = Boolean(event.registration_url && event.end_date>=today && event.registration_status !== 'closed' && !['canceled','completed'].includes(effectiveStatus));
  const canAddCalendar = event.end_date>=today && !['canceled','completed'].includes(effectiveStatus);
  const tdNames = event.td_names??[];
  const resultLabel = event.results_url ? resultsLinkLabel(event.results_url) : '';
  const detailHref=`${eventDetailPath(event)}?return=${encodeURIComponent(currentEventsPath())}`;
  const hbnfEvent=isHbnfEvent(event);
  const canShowOfficialInfo=Boolean(event.official_url&&!hbnfEvent&&event.official_url!==event.registration_url&&event.official_url!==event.results_url);
  return <article className={`event-card ${effectiveStatus==='canceled'?'is-canceled':''}`}>
    <div className="event-date-block"><strong>{eventDateRange(event.start_date,event.end_date)}</strong><span>{event.county?`${event.county} County`:'Southern California'}</span></div>
    <div className="event-main">
      <div className="event-heading-row"><div><h3><a className="event-title-link" href={detailHref}>{event.name}</a></h3><p className="event-location">{[event.city,event.course_name||event.venue_name].filter(Boolean).join(' · ')||'Location TBA'}</p></div><span className={`status-pill status-${effectiveStatus}`}>{eventTitle(effectiveStatus)}</span></div>
      <div className="event-tags"><span>{eventTitle(event.event_type)}</span><span>{event.sanctioned===true?(event.tier?`Sanctioned · ${event.tier}`:'Sanctioned'):event.sanctioned===false?'Unsanctioned':'Sanction unknown'}</span>{event.rounds_text?<span>{event.rounds_text}</span>:null}{event.format?<span>{event.format}</span>:null}</div>
      {event.club_host?<p className="event-organizer">Hosted by {event.club_host}{tdNames.length?` · TD: ${tdNames.join(', ')}`:''}</p>:tdNames.length?<p className="event-organizer">TD: {tdNames.join(', ')}</p>:null}
      {hbnfEvent?<nav className="event-resource-links" aria-label={`HB Night Flyers links for ${event.name}`}>{HBNF_EVENT_LINKS.map(link=><a key={link.label} href={link.href} target="_blank" rel="noreferrer" aria-label={`${link.label} for ${event.name} (opens in new tab)`}>{link.label} ↗</a>)}</nav>:null}
      {stale?<p className="stale-note">Verification is older than 14 days; confirm details before traveling.</p>:null}
      {event.top_results?.length?<div className="results-block"><div className="results-title">Results · {eventTitle(event.top_results[0]?.division_code??'')}</div><ol>{event.top_results.map((r)=><li key={`${r.division_code}-${r.place}-${r.player_name}`}><span>{r.place}. {r.player_name}</span><strong>{resultValue(r)}</strong></li>)}</ol></div>:null}
    </div>
    <div className="event-actions">{canShowRegistration?<a className="button primary" href={event.registration_url!} target="_blank" rel="noreferrer" aria-label={`Registration for ${event.name} (opens in new tab)`}>Registration</a>:null}{canShowOfficialInfo?<a className="button ghost" href={event.official_url!} target="_blank" rel="noreferrer" aria-label={`Official info for ${event.name} (opens in new tab)`}>Official Info ↗</a>:null}<a className="button ghost" href={detailHref} aria-label={`View details for ${event.name}`}>Details</a>{canAddCalendar?<button type="button" className="button ghost" onClick={()=>downloadEventCalendar(event)} aria-label={`Add ${event.name} to calendar`}>Add to Calendar</button>:null}{event.top_results?.length?<a className="button ghost" href={`${detailHref}#results`}>Full Results</a>:null}{event.results_url?<a className="button ghost" href={event.results_url} target="_blank" rel="noreferrer" aria-label={`${resultLabel} for ${event.name} (opens in new tab)`}>{resultLabel}</a>:null}</div>
  </article>;
}

function SubmissionForm() {
  const [state,setState]=useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [message,setMessage]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setState('sending'); setMessage('');
    const form=e.currentTarget;
    const fd=new FormData(form), s=fd.get('sanctioned');
    try {
      await callFunction('lr-submit-event',{
        name:fd.get('name'),start_date:fd.get('start_date'),end_date:fd.get('end_date'),county:fd.get('county'),city:fd.get('city'),course_name:fd.get('course_name'),event_type:fd.get('event_type'),
        sanctioned:s==='yes'?true:s==='no'?false:undefined,tier:fd.get('tier'),registration_url:fd.get('registration_url'),source_url:fd.get('source_url'),club_host:fd.get('club_host'),
        td_names:String(fd.get('td_names')??'').split(',').map(v=>v.trim()).filter(Boolean),submitter_name:fd.get('submitter_name'),submitter_email:fd.get('submitter_email'),notes:fd.get('notes'),website:fd.get('website'),
      });
      setState('sent'); setMessage('Submitted for review.'); form.reset();
    } catch {setState('error');setMessage('The event could not be submitted.');}
  }
  return <details id="submit" className="submit-disclosure"><summary>Submit an event</summary><div className="submit-section"><div className="section-intro"><h2>Submit an event</h2></div>
    <form className="submission-form" onSubmit={submit}>
      <div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
      <label className="span-2">Event name<input name="name" required maxLength={200}/></label><label>Start date<input type="date" name="start_date" required/></label><label>End date<input type="date" name="end_date"/></label>
      <label>County<select name="county" required defaultValue="Orange">{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></label><label>City<input name="city" maxLength={120}/></label>
      <label className="span-2">Course / venue<input name="course_name" maxLength={200}/></label><label>Event type<select name="event_type" defaultValue="tournament">{EVENT_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Sanctioned?<select name="sanctioned" defaultValue="unknown"><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label><label>Tier<input name="tier" maxLength={80} placeholder="C-Tier, B-Tier…"/></label>
      <label>Host / club<input name="club_host" maxLength={200}/></label><label className="span-2">TD name(s)<input name="td_names" placeholder="Separate names with commas"/></label>
      <label className="span-2">Registration link<input type="url" name="registration_url" placeholder="https://…"/></label><label className="span-2">Official/source link<input type="url" name="source_url" placeholder="https://…"/></label>
      <label>Your name<input name="submitter_name" maxLength={160} autoComplete="name"/></label><label>Your email<input type="email" name="submitter_email" maxLength={320} autoComplete="email"/></label><label className="span-2">Notes<textarea name="notes" rows={3} maxLength={4000}/></label>
      <div className="form-footer span-2"><button type="submit" className="button primary" disabled={state==='sending'}>{state==='sending'?'Submitting…':'Submit event'}</button>{message?<span role={state==='error'?'alert':'status'} aria-live={state==='error'?'assertive':'polite'} aria-atomic="true" className={state==='error'?'form-error':'form-success'}>{message}</span>:null}</div>
    </form></div></details>;
}

export function EventsPage({landing=false}:{landing?:boolean}={}){
  const initialFilters=useMemo(()=>readEventFilters(),[]);
  const [events,setEvents]=useState<PublicEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  const [view,setView]=useState<EventView>(initialFilters.view),[query,setQuery]=useState(initialFilters.query),[county,setCounty]=useState(initialFilters.county),[sanction,setSanction]=useState(initialFilters.sanction),[eventType,setEventType]=useState(initialFilters.eventType),[month,setMonth]=useState(initialFilters.month),[resultsFilter,setResultsFilter]=useState<ResultsFilter>(initialFilters.results);
  useEffect(()=>{supabase!.rpc('lr_public_events').then(({data,error})=>{if(error)setError(true);else setEvents((data??[]) as PublicEvent[]);setLoading(false);});},[]);
  const today=pacificToday();
  const viewEvents=useMemo(()=>events.filter(e=>view==='upcoming'?e.end_date>=today:e.end_date<today),[events,view,today]);
  const months=useMemo(()=>Array.from(new Set(viewEvents.map(e=>monthKey(e.start_date))).values()).sort((a,b)=>view==='results'?b.localeCompare(a):a.localeCompare(b)),[viewEvents,view]);
  useEffect(()=>{if(month!=='all'&&!months.includes(month))setMonth('all');},[month,months]);
  useEffect(()=>{
    if(typeof window==='undefined')return;
    const params=new URLSearchParams();
    if(view!=='upcoming')params.set('view',view);
    if(query.trim())params.set('q',query.trim());
    if(county!=='all')params.set('county',county);
    if(sanction!=='all')params.set('sanction',sanction);
    if(eventType!=='all')params.set('type',eventType);
    if(month!=='all')params.set('month',month);
    if(resultsFilter!=='all')params.set('results',resultsFilter);
    const search=params.toString();
    const next=`${window.location.pathname}${search?`?${search}`:''}${window.location.hash}`;
    window.history.replaceState(null,'',next);
  },[view,query,county,sanction,eventType,month,resultsFilter]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return viewEvents.filter(e=>{
      if(county!=='all'&&e.county!==county)return false;if(sanction==='yes'&&e.sanctioned!==true)return false;if(sanction==='no'&&e.sanctioned!==false)return false;if(eventType!=='all'&&e.event_type!==eventType)return false;if(month!=='all'&&monthKey(e.start_date)!==month)return false;
      if(resultsFilter==='local'&&!e.top_results?.length)return false;if(resultsFilter==='official'&&!e.results_url)return false;
      if(needle){const haystack=[e.name,e.city,e.course_name,e.venue_name,e.club_host,...(e.td_names??[])].filter(Boolean).join(' ').toLowerCase();if(!haystack.includes(needle))return false;}
      return true;
    }).sort((a,b)=>view==='results'?(b.end_date.localeCompare(a.end_date)||a.name.localeCompare(b.name)):(a.start_date.localeCompare(b.start_date)||a.name.localeCompare(b.name)));
  },[viewEvents,view,query,county,sanction,eventType,month,resultsFilter]);
  const viewTitle=view==='results'?'Past events & results':'Upcoming events';
  const hasActiveFilters=Boolean(query.trim()||county!=='all'||sanction!=='all'||eventType!=='all'||month!=='all'||resultsFilter!=='all');
  function clearFilters(){setQuery('');setCounty('all');setSanction('all');setEventType('all');setMonth('all');setResultsFilter('all');}
  return <Shell><main className={`events-page ${landing?'events-landing':''}`}><h1 className="sr-only">Southern California Disc Golf Events</h1>
    <section className="events-layout content"><div className="filters" role="group" aria-label="Event filters"><div className="event-view-switch" role="group" aria-label="Event view"><button type="button" className={`button ${view==='upcoming'?'primary':'ghost'}`} aria-pressed={view==='upcoming'} onClick={()=>setView('upcoming')}>Upcoming</button><button type="button" className={`button ${view==='results'?'primary':'ghost'}`} aria-pressed={view==='results'} onClick={()=>setView('results')}>Results</button></div><label className="filter-search">Search<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Event, course, city, host…"/></label><label>Month<select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">All months</option>{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label><label>County<select value={county} onChange={e=>setCounty(e.target.value)}><option value="all">All six counties</option>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></label><label>Sanction<select value={sanction} onChange={e=>setSanction(e.target.value)}><option value="all">All</option><option value="yes">Sanctioned</option><option value="no">Unsanctioned</option></select></label><label>Type<select value={eventType} onChange={e=>setEventType(e.target.value)}><option value="all">All types</option>{EVENT_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Results<select value={resultsFilter} onChange={e=>setResultsFilter(e.target.value as ResultsFilter)}><option value="all">All</option><option value="local">On Local Roots</option><option value="official">Official link</option></select></label>{hasActiveFilters?<button type="button" className="clear-filters" onClick={clearFilters}>Clear filters</button>:null}</div>
    <div className="event-list" data-status-policy="date-aware-v1" aria-busy={loading}><div className="list-header"><h2>{viewTitle}</h2><span aria-live="polite" aria-atomic="true">{filtered.length} shown · {viewEvents.length} {view==='upcoming'?'upcoming':'past'}</span></div>{loading?<div className="empty-state" role="status" aria-live="polite">Loading events…</div>:null}{error?<div className="notice error" role="alert">Could not load events.</div>:null}{!loading&&!error&&!filtered.length?<div className="empty-state" role="status"><strong>No matching events.</strong><span>Change or clear the filters.</span></div>:null}{filtered.map(e=><EventCard key={e.id} event={e} today={today}/>)}</div></section>
    <div className="content"><SubmissionForm/></div></main></Shell>;
}
