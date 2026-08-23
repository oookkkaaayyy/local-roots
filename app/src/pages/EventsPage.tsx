import { FormEvent, useEffect, useMemo, useState } from 'react';
import { callFunction, supabase } from '../lib/supabase';
import { Shell } from '../components/Shell';
import type { PublicEvent } from '../types';

const COUNTIES = ['Ventura', 'Los Angeles', 'Orange', 'Riverside', 'San Bernardino', 'San Diego'];
const EVENT_TYPES = [
  ['tournament','Tournament'],['flex_start','Flex start'],['league','League'],['doubles','Doubles'],['team','Team'],
  ['putting','Putting'],['ace_race','Ace race'],['circuit_challenge','Circuit challenge'],['tag_match','Tag match'],
  ['clinic','Clinic'],['charity','Charity'],['community','Community'],['other','Other'],
] as const;

const title = (v: string) => v.replaceAll('_',' ').replace(/\b\w/g,(m)=>m.toUpperCase());
const monthKey = (v: string) => v.slice(0,7);
function dateRange(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`), b = new Date(`${end}T12:00:00Z`);
  const short = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const full = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  return start===end ? full.format(a) : `${short.format(a)}–${full.format(b)}`;
}
function monthLabel(key: string) {
  const [y,m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1,12)));
}
function pacificToday() {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function EventCard({event}:{event:PublicEvent}) {
  const stale = Boolean(event.last_verified_at && Date.now()-new Date(event.last_verified_at).getTime()>14*86400000);
  const canShowRegistration = Boolean(event.registration_url && !['canceled','completed'].includes(event.status));
  return <article className={`event-card ${event.status==='canceled'?'is-canceled':''}`}>
    <div className="event-date-block"><strong>{dateRange(event.start_date,event.end_date)}</strong><span>{event.county?`${event.county} County`:'Southern California'}</span></div>
    <div className="event-main">
      <div className="event-heading-row"><div><h3>{event.name}</h3><p className="event-location">{[event.city,event.course_name||event.venue_name].filter(Boolean).join(' · ')||'Location TBA'}</p></div><span className={`status-pill status-${event.status}`}>{title(event.status)}</span></div>
      <div className="event-tags"><span>{title(event.event_type)}</span><span>{event.sanctioned===true?(event.tier?`Sanctioned · ${event.tier}`:'Sanctioned'):event.sanctioned===false?'Unsanctioned':'Sanction unknown'}</span>{event.rounds_text?<span>{event.rounds_text}</span>:null}{event.format?<span>{event.format}</span>:null}</div>
      {event.club_host||event.td_names?.length?<p className="event-organizer">Hosted by {[event.club_host,...(event.td_names??[])].filter(Boolean).join(' · ')}</p>:null}
      {stale?<p className="stale-note">Verification is older than 14 days; confirm details before traveling.</p>:null}
      {event.top_results?.length?<div className="results-block"><div className="results-title">Results · {title(event.top_results[0]?.division_code??'')}</div><ol>{event.top_results.map((r)=><li key={`${r.division_code}-${r.place}-${r.player_name}`}><span>{r.place}. {r.player_name}</span><strong>{r.to_par==null?(r.total_score??'—'):`${r.to_par>0?'+':''}${r.to_par}`}</strong></li>)}</ol></div>:null}
    </div>
    <div className="event-actions">{canShowRegistration?<a className="button primary" href={event.registration_url!} target="_blank" rel="noreferrer">Registration</a>:null}{event.results_url?<a className="button ghost" href={event.results_url} target="_blank" rel="noreferrer">Results</a>:null}</div>
  </article>;
}

function SubmissionForm() {
  const [state,setState]=useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [message,setMessage]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setState('sending'); setMessage('');
    const fd=new FormData(e.currentTarget), s=fd.get('sanctioned');
    try {
      await callFunction('lr-submit-event',{
        name:fd.get('name'),start_date:fd.get('start_date'),end_date:fd.get('end_date'),county:fd.get('county'),city:fd.get('city'),course_name:fd.get('course_name'),event_type:fd.get('event_type'),
        sanctioned:s==='yes'?true:s==='no'?false:undefined,tier:fd.get('tier'),registration_url:fd.get('registration_url'),source_url:fd.get('source_url'),club_host:fd.get('club_host'),
        td_names:String(fd.get('td_names')??'').split(',').map(v=>v.trim()).filter(Boolean),submitter_name:fd.get('submitter_name'),submitter_email:fd.get('submitter_email'),notes:fd.get('notes'),website:fd.get('website'),
      });
      setState('sent'); setMessage('Submitted. Local Roots will review it before publication.'); e.currentTarget.reset();
    } catch(err){setState('error');setMessage(err instanceof Error?err.message:'Submission failed.');}
  }
  return <section id="submit" className="submit-section"><div className="section-intro"><span className="eyebrow">Community coverage</span><h2>Missing an event?</h2><p>Send the basics. Every submission is validated and reviewed before publication.</p></div>
    <form className="submission-form" onSubmit={submit}>
      <div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
      <label className="span-2">Event name<input name="name" required maxLength={200}/></label><label>Start date<input type="date" name="start_date" required/></label><label>End date<input type="date" name="end_date"/></label>
      <label>County<select name="county" required defaultValue="Orange">{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></label><label>City<input name="city" maxLength={120}/></label>
      <label className="span-2">Course / venue<input name="course_name" maxLength={200}/></label><label>Event type<select name="event_type" defaultValue="tournament">{EVENT_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Sanctioned?<select name="sanctioned" defaultValue="unknown"><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label><label>Tier<input name="tier" maxLength={80} placeholder="C-Tier, B-Tier…"/></label>
      <label>Host / club<input name="club_host" maxLength={200}/></label><label className="span-2">TD name(s)<input name="td_names" placeholder="Separate names with commas"/></label>
      <label className="span-2">Registration link<input type="url" name="registration_url" placeholder="https://…"/></label><label className="span-2">Official/source link<input type="url" name="source_url" placeholder="https://…"/></label>
      <label>Your name<input name="submitter_name" maxLength={160}/></label><label>Your email<input type="email" name="submitter_email" maxLength={320}/></label><label className="span-2">Notes<textarea name="notes" rows={3} maxLength={4000}/></label>
      <div className="form-footer span-2"><button className="button primary" disabled={state==='sending'}>{state==='sending'?'Submitting…':'Submit event'}</button>{message?<span className={state==='error'?'form-error':'form-success'}>{message}</span>:null}</div>
    </form></section>;
}

export function EventsPage(){
  const [events,setEvents]=useState<PublicEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [county,setCounty]=useState('all'),[sanction,setSanction]=useState('all'),[eventType,setEventType]=useState('all'),[month,setMonth]=useState('all'),[showPast,setShowPast]=useState(false);
  useEffect(()=>{supabase!.rpc('lr_public_events').then(({data,error})=>{if(error)setError(error.message);else setEvents((data??[]) as PublicEvent[]);setLoading(false);});},[]);
  const months=useMemo(()=>Array.from(new Set(events.map(e=>monthKey(e.start_date))).values()).sort(),[events]);
  const today=pacificToday();
  const filtered=useMemo(()=>events.filter(e=>{
    if(!showPast&&e.end_date<today&&e.status==='completed')return false;if(county!=='all'&&e.county!==county)return false;if(sanction==='yes'&&e.sanctioned!==true)return false;if(sanction==='no'&&e.sanctioned!==false)return false;if(eventType!=='all'&&e.event_type!==eventType)return false;if(month!=='all'&&monthKey(e.start_date)!==month)return false;return true;
  }),[events,showPast,today,county,sanction,eventType,month]);
  return <Shell><main><section className="hero"><div><span className="eyebrow">Ventura → San Diego</span><h1>Southern California disc golf, in one place.</h1><p>Upcoming tournaments, leagues, doubles, putting events and community rounds across six counties.</p></div><div className="hero-stat"><strong>{events.length}</strong><span>published events</span></div></section>
    <section className="events-layout content"><div className="filters"><label>Month<select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">All upcoming</option>{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label><label>County<select value={county} onChange={e=>setCounty(e.target.value)}><option value="all">All six counties</option>{COUNTIES.map(c=><option key={c}>{c}</option>)}</select></label><label>Sanction<select value={sanction} onChange={e=>setSanction(e.target.value)}><option value="all">All</option><option value="yes">Sanctioned</option><option value="no">Unsanctioned</option></select></label><label>Type<select value={eventType} onChange={e=>setEventType(e.target.value)}><option value="all">All types</option>{EVENT_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={showPast} onChange={e=>setShowPast(e.target.checked)}/> Show completed</label></div>
    <div className="event-list"><div className="list-header"><h2>Events</h2><span>{filtered.length} shown</span></div>{loading?<div className="empty-state">Loading events…</div>:null}{error?<div className="notice error">Could not load events: {error}</div>:null}{!loading&&!error&&!filtered.length?<div className="empty-state"><strong>No matching events yet.</strong><span>Try broader filters or submit one below.</span></div>:null}{filtered.map(e=><EventCard key={e.id} event={e}/>)}</div></section>
    <div className="content"><SubmissionForm/></div></main></Shell>;
}
