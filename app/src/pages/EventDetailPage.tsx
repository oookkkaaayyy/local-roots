import { useEffect, useState } from 'react';
import { Shell } from '../components/Shell';
import { supabase } from '../lib/supabase';
import { downloadEventCalendar, eventDateRange, eventTitle, pacificToday, resultValue, resultsLinkLabel } from '../lib/eventPresentation';
import type { PublicEvent } from '../types';

export function EventDetailPage({slug}:{slug:string}) {
  const [event,setEvent]=useState<PublicEvent|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    supabase!.rpc('lr_public_events').then(({data,error})=>{
      if(error)setError(error.message);
      else setEvent(((data??[]) as PublicEvent[]).find(item=>item.slug===slug)??null);
      setLoading(false);
    });
  },[slug]);

  useEffect(()=>{
    if(!event)return;
    document.title=`${event.name} · Local Roots`;
    const description=document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if(description)description.content=`${eventDateRange(event.start_date,event.end_date)} · ${[event.city,event.course_name||event.venue_name].filter(Boolean).join(' · ')||'Southern California disc golf event'}`;
  },[event]);

  if(loading)return <Shell><main className="content narrow event-detail-page"><div className="empty-state" role="status" aria-live="polite">Loading event…</div></main></Shell>;
  if(error)return <Shell><main className="content narrow event-detail-page"><div className="notice error" role="alert"><strong>Could not load this event.</strong><span>{error}</span></div><a href="/events">Return to events</a></main></Shell>;
  if(!event)return <Shell><main className="content narrow event-detail-page"><div className="empty-state"><strong>Event not found.</strong><span>It may have been unpublished, renamed, or removed.</span></div><a href="/events">Return to events</a></main></Shell>;

  const today=pacificToday();
  const effectiveStatus=['canceled','completed'].includes(event.status)?event.status:event.end_date<today?'completed':event.status;
  const canShowRegistration=Boolean(event.registration_url&&event.end_date>=today&&event.registration_status!=='closed'&&!['canceled','completed'].includes(effectiveStatus));
  const canAddCalendar=event.end_date>=today&&!['canceled','completed'].includes(effectiveStatus);
  const stale=Boolean(event.last_verified_at&&Date.now()-new Date(event.last_verified_at).getTime()>14*86400000);
  const resultLabel=event.results_url?resultsLinkLabel(event.results_url):'';
  const tdNames=event.td_names??[];

  return <Shell><main className="content narrow event-detail-page">
    <a className="event-back-link" href="/events">← All events</a>
    <article className="event-detail-card">
      <div className="event-detail-heading"><div><p className="eyebrow">{eventDateRange(event.start_date,event.end_date)}</p><h1>{event.name}</h1><p className="event-location">{[event.city,event.course_name||event.venue_name].filter(Boolean).join(' · ')||'Location TBA'}</p></div><span className={`status-pill status-${effectiveStatus}`}>{eventTitle(effectiveStatus)}</span></div>
      <div className="event-tags"><span>{eventTitle(event.event_type)}</span><span>{event.sanctioned===true?(event.tier?`Sanctioned · ${event.tier}`:'Sanctioned'):event.sanctioned===false?'Unsanctioned':'Sanction unknown'}</span>{event.rounds_text?<span>{event.rounds_text}</span>:null}{event.format?<span>{event.format}</span>:null}</div>
      {event.club_host?<p className="event-organizer">Hosted by {event.club_host}{tdNames.length?` · TD: ${tdNames.join(', ')}`:''}</p>:tdNames.length?<p className="event-organizer">TD: {tdNames.join(', ')}</p>:null}
      {stale?<p className="stale-note">Verification is older than 14 days; confirm details before traveling.</p>:null}
      <div className="event-detail-actions">{canShowRegistration?<a className="button primary" href={event.registration_url!} target="_blank" rel="noreferrer" aria-label={`Registration for ${event.name} (opens in new tab)`}>Registration</a>:null}{canAddCalendar?<button type="button" className="button ghost" onClick={()=>downloadEventCalendar(event)}>Add to Calendar</button>:null}{event.results_url?<a className="button ghost" href={event.results_url} target="_blank" rel="noreferrer" aria-label={`${resultLabel} for ${event.name} (opens in new tab)`}>{resultLabel}</a>:null}</div>
      {event.top_results?.length?<section className="event-detail-results" aria-labelledby="event-results-heading"><h2 id="event-results-heading">Results · {eventTitle(event.top_results[0]?.division_code??'')}</h2><ol>{event.top_results.map(result=><li key={`${result.division_code}-${result.place}-${result.player_name}`}><span>{result.place}. {result.player_name}</span><strong>{resultValue(result)}</strong></li>)}</ol></section>:null}
    </article>
  </main></Shell>;
}
