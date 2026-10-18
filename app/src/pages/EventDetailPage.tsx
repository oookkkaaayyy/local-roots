import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Shell } from '../components/Shell';
import { callFunction, supabase } from '../lib/supabase';
import { downloadEventCalendar, eventDateRange, eventTitle, HBNF_EVENT_LINKS, isHbnfEvent, pacificToday, resultValue, resultsLinkLabel } from '../lib/eventPresentation';
import { parseOrganizerResultsText, type OrganizerScoreType } from '../lib/resultsSubmission';
import type { PublicEventDetail, PublicResult } from '../types';

function safeReturnPath() {
  if(typeof window==='undefined')return '/events';
  const candidate=new URLSearchParams(window.location.search).get('return');
  return candidate?.startsWith('/events')?candidate:'/events';
}

function groupResults(results:PublicResult[]) {
  const grouped=new Map<string,PublicResult[]>();
  for(const result of results){
    const rows=grouped.get(result.division_code)??[];
    rows.push(result);
    grouped.set(result.division_code,rows);
  }
  return Array.from(grouped.entries());
}

function ResultsSubmission({event}:{event:PublicEventDetail}) {
  const [scoreType,setScoreType]=useState<OrganizerScoreType>('to_par');
  const [resultsText,setResultsText]=useState('');
  const [featuredDivision,setFeaturedDivision]=useState('');
  const [state,setState]=useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [message,setMessage]=useState('');
  const parsed=useMemo(()=>parseOrganizerResultsText(resultsText,scoreType),[resultsText,scoreType]);

  useEffect(()=>{
    if(!parsed.divisions.length){setFeaturedDivision('');return;}
    if(!parsed.divisions.includes(featuredDivision))setFeaturedDivision(parsed.divisions[0]??'');
  },[parsed.divisions,featuredDivision]);

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setMessage('');
    if(parsed.errors.length||!parsed.rows.length||!featuredDivision){setState('error');setMessage(parsed.errors[0]??'Check the result rows.');return;}
    const form=e.currentTarget;
    const fd=new FormData(form);
    setState('sending');
    try{
      await callFunction('lr-submit-results',{
        event_id:event.id,
        score_type:scoreType,
        featured_division:featuredDivision,
        results:parsed.rows,
        submitter_name:fd.get('submitter_name'),
        submitter_email:fd.get('submitter_email'),
        submitter_role:fd.get('submitter_role'),
        organization:fd.get('organization'),
        source_notes:fd.get('source_notes'),
        attested:fd.get('attested')==='yes',
        website:fd.get('website'),
      });
      setState('sent');
      setMessage('Submitted for Local Roots review.');
      form.reset();
      setResultsText('');
      setFeaturedDivision('');
      setScoreType('to_par');
    }catch{
      setState('error');
      setMessage('The results could not be submitted.');
    }
  }

  return <details className="results-submit-disclosure">
    <summary>Submit organizer results</summary>
    <form className="results-submission-form" onSubmit={submit}>
      <div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
      <div className="results-submit-grid">
        <label>Club / organizer<input name="organization" required maxLength={200}/></label>
        <label>Your role<input name="submitter_role" required maxLength={120} placeholder="TD, club officer, event staff…"/></label>
        <label>Your name<input name="submitter_name" required maxLength={160} autoComplete="name"/></label>
        <label>Your email<input type="email" name="submitter_email" required maxLength={320} autoComplete="email"/></label>
        <label>Score format<select value={scoreType} onChange={e=>setScoreType(e.target.value as OrganizerScoreType)}><option value="to_par">To par (+2, -4, E)</option><option value="total_score">Total score</option><option value="points">Points / skins</option></select></label>
        <label>Featured division<select required value={featuredDivision} onChange={e=>setFeaturedDivision(e.target.value)} disabled={!parsed.divisions.length}><option value="">Paste results first</option>{parsed.divisions.map(division=><option key={division}>{division}</option>)}</select></label>
      </div>
      <label>Results<textarea required rows={9} value={resultsText} onChange={e=>setResultsText(e.target.value)} placeholder={'division,place,player,score\nMPO,1,Player Name,-8\nMPO,2,Player Name,-5'}/></label>
      {resultsText&&parsed.errors.length?<div className="notice error" role="alert">{parsed.errors.slice(0,4).map(error=><span key={error}>{error}</span>)}</div>:null}
      {resultsText&&!parsed.errors.length&&parsed.rows.length?<div className="results-parse-status" role="status">{parsed.rows.length} rows · {parsed.divisions.join(', ')}</div>:null}
      <label>Verification note<textarea name="source_notes" rows={2} maxLength={2000}/></label>
      <label className="results-attestation"><input type="checkbox" name="attested" value="yes" required/><span>I am authorized by the organizer or club to submit these results, and they come from our own event records—not copied from PDGA, UDisc, Disc Golf Scene, or another third-party standings page.</span></label>
      <div className="form-footer"><button className="button primary" type="submit" disabled={state==='sending'||Boolean(parsed.errors.length)||!parsed.rows.length}>{state==='sending'?'Submitting…':'Submit results'}</button>{message?<span role={state==='error'?'alert':'status'} aria-live={state==='error'?'assertive':'polite'} className={state==='error'?'form-error':'form-success'}>{message}</span>:null}</div>
    </form>
  </details>;
}

export function EventDetailPage({slug}:{slug:string}) {
  const [event,setEvent]=useState<PublicEventDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [shareState,setShareState]=useState('');
  const returnPath=safeReturnPath();

  useEffect(()=>{
    supabase!.rpc('lr_public_event_detail',{p_slug:slug}).then(({data,error})=>{
      if(error)setError(true);
      else setEvent(((data??[]) as PublicEventDetail[])[0]??null);
      setLoading(false);
    });
  },[slug]);

  useEffect(()=>{
    if(!event)return;
    document.title=`${event.name} · Local Roots`;
    const description=document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if(description)description.content=`${eventDateRange(event.start_date,event.end_date)} · ${[event.city,event.course_name||event.venue_name].filter(Boolean).join(' · ')||'Southern California disc golf event'}`;
  },[event]);

  useEffect(()=>{
    if(loading||event)return;
    let robots=document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots);}
    robots.content='noindex,nofollow,noarchive';
  },[loading,event,error]);

  async function share(){
    if(!event)return;
    const url=`${window.location.origin}/events/${encodeURIComponent(event.slug)}`;
    try{
      if(navigator.share){await navigator.share({title:event.name,url});setShareState('');return;}
      await navigator.clipboard.writeText(url);setShareState('Link copied');
    }catch{/* User canceled or clipboard unavailable. */}
  }

  if(loading)return <Shell><main className="content narrow event-detail-page"><div className="empty-state" role="status" aria-live="polite">Loading event…</div></main></Shell>;
  if(error)return <Shell><main className="content narrow event-detail-page"><div className="notice error" role="alert"><strong>Could not load this event.</strong></div><a href={returnPath}>Return to events</a></main></Shell>;
  if(!event)return <Shell><main className="content narrow event-detail-page"><div className="empty-state"><strong>Event not found.</strong><span>It may have been unpublished, renamed, or removed.</span></div><a href={returnPath}>Return to events</a></main></Shell>;

  const today=pacificToday();
  const effectiveStatus=['canceled','completed'].includes(event.status)?event.status:event.end_date<today?'completed':event.status;
  const canShowRegistration=Boolean(event.registration_url&&event.end_date>=today&&event.registration_status!=='closed'&&!['canceled','completed'].includes(effectiveStatus));
  const canAddCalendar=event.end_date>=today&&!['canceled','completed'].includes(effectiveStatus);
  const canSubmitResults=effectiveStatus==='completed';
  const stale=Boolean(event.last_verified_at&&Date.now()-new Date(event.last_verified_at).getTime()>14*86400000);
  const resultLabel=event.results_url?resultsLinkLabel(event.results_url):'';
  const tdNames=event.td_names??[];
  const resultGroups=groupResults(event.all_results??[]);
  const hbnfEvent=isHbnfEvent(event);
  const canShowOfficialInfo=Boolean(event.official_url&&!hbnfEvent&&event.official_url!==event.registration_url&&event.official_url!==event.results_url);

  return <Shell><main className="content narrow event-detail-page">
    <a className="event-back-link" href={returnPath}>← Events</a>
    <article className="event-detail-card">
      <div className="event-detail-heading"><div><p className="eyebrow">{eventDateRange(event.start_date,event.end_date)}</p><h1>{event.name}</h1><p className="event-location">{[event.city,event.course_name||event.venue_name].filter(Boolean).join(' · ')||'Location TBA'}</p></div><span className={`status-pill status-${effectiveStatus}`}>{eventTitle(effectiveStatus)}</span></div>
      <div className="event-tags"><span>{eventTitle(event.event_type)}</span><span>{event.sanctioned===true?(event.tier?`Sanctioned · ${event.tier}`:'Sanctioned'):event.sanctioned===false?'Unsanctioned':'Sanction unknown'}</span>{event.rounds_text?<span>{event.rounds_text}</span>:null}{event.format?<span>{event.format}</span>:null}</div>
      {event.club_host?<p className="event-organizer">Hosted by {event.club_host}{tdNames.length?` · TD: ${tdNames.join(', ')}`:''}</p>:tdNames.length?<p className="event-organizer">TD: {tdNames.join(', ')}</p>:null}
      {hbnfEvent?<nav className="event-resource-links" aria-label={`HB Night Flyers links for ${event.name}`}>{HBNF_EVENT_LINKS.map(link=><a key={link.label} href={link.href} target="_blank" rel="noreferrer" aria-label={`${link.label} for ${event.name} (opens in new tab)`}>{link.label}</a>)}</nav>:null}
      {stale?<p className="stale-note">Verification is older than 14 days; confirm details before traveling.</p>:null}
      <div className="event-detail-actions">{canShowRegistration?<a className="button primary" href={event.registration_url!} target="_blank" rel="noreferrer" aria-label={`Registration for ${event.name} (opens in new tab)`}>Registration</a>:null}{canShowOfficialInfo?<a className="button ghost" href={event.official_url!} target="_blank" rel="noreferrer" aria-label={`Official info for ${event.name} (opens in new tab)`}>Official Info</a>:null}{canAddCalendar?<button type="button" className="button ghost" onClick={()=>downloadEventCalendar(event)} aria-label={`Add ${event.name} to calendar`}>Add to Calendar</button>:null}<button type="button" className="button ghost" onClick={share}>Share</button>{event.results_url?<a className="button ghost" href={event.results_url} target="_blank" rel="noreferrer" aria-label={`${resultLabel} for ${event.name} (opens in new tab)`}>{resultLabel}</a>:null}</div>
      {shareState?<div className="results-parse-status" role="status">{shareState}</div>:null}

      {resultGroups.length?<section id="results" className="event-detail-results" aria-labelledby="event-results-heading"><h2 id="event-results-heading">Results</h2>{resultGroups.map(([division,rows])=><div className="result-division" key={division}><h3>{division}</h3><div className="result-table-wrap"><table className="result-table"><thead><tr><th>Place</th><th>Player / team</th><th>Score</th></tr></thead><tbody>{rows.map(result=><tr key={`${result.division_code}-${result.place}-${result.player_name}`}><td>{result.place}</td><td>{result.player_name}</td><td><strong>{resultValue(result)}</strong></td></tr>)}</tbody></table></div></div>)}</section>:null}
      {canSubmitResults?<ResultsSubmission event={event}/>:null}
    </article>
  </main></Shell>;
}
