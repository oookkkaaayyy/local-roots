import { useEffect, useMemo, useState } from 'react';
import { Shell, Mast } from '../components/Shell';
import { eventDateRange, eventDetailPath, isHbnfEvent, pacificToday } from '../lib/eventPresentation';
import { supabase } from '../lib/supabase';
import type { PublicEvent } from '../types';

const HBNF_DESTINATIONS = [
  { label: 'Skins', href: 'https://hbnightflyers.com/skins' },
  { label: 'Glow', href: 'https://hbnightflyers.com/glow' },
] as const;

export function HbnfPage() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const today = pacificToday();

  useEffect(() => {
    let active = true;
    supabase!.rpc('lr_public_events').then(({ data, error: requestError }) => {
      if (!active) return;
      if (requestError) setError(true);
      else setEvents((data ?? []) as PublicEvent[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const upcomingEvents = useMemo(
    () => events
      .filter((event) => isHbnfEvent(event) && event.end_date >= today && event.status !== 'canceled')
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name)),
    [events, today],
  );

  return <Shell mast={<Mast title={<><img className="hb-mark" src="/brand/hbnf-mark-authentic.png" alt="" width="44" height="44" />HB Night Flyers</>} aside={<nav className="lr-actions" aria-label="Skins and Glow">{HBNF_DESTINATIONS.map(({ label, href }) => <a key={href} className="lr-btn lr-btn-ghost" href={href} target="_blank" rel="noreferrer" aria-label={'Open ' + label + ' (opens in a new tab)'}>{label}</a>)}</nav>} />}><main className="lr-wrap hb-events">
    {loading ? <p className="hb-state" role="status">Loading events…</p> : null}
    {error ? <p className="hb-state" role="alert">HB Night Flyers events could not be loaded.</p> : null}
    {!loading && !error && upcomingEvents.length === 0 ? <p className="hb-state">No upcoming events are listed.</p> : null}
    {!loading && !error && upcomingEvents.length > 0 ? <ul className="hb-list">
      {upcomingEvents.map((event) => {
        const venue = [event.course_name || event.venue_name, event.city].filter(Boolean).join(' · ');
        return <li className="hb-row" key={event.id}>
          <time dateTime={event.start_date}>{eventDateRange(event.start_date, event.end_date)}</time>
          <div><h2><a href={eventDetailPath(event)}>{event.name}</a></h2>{venue ? <p>{venue}</p> : null}</div>
        </li>;
      })}
    </ul> : null}
  </main></Shell>;
}
