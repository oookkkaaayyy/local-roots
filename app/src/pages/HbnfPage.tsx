import { useEffect, useMemo, useState } from 'react';
import { Shell } from '../components/Shell';
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

  return <Shell><main className="hbnf-page content">
    <header className="hbnf-heading">
      <span className="hbnf-logo" role="img" aria-label="HB Night Flyers logo" />
      <div className="hbnf-heading-copy">
        <p className="hbnf-independence">Independent club</p>
        <h1>HB Night Flyers</h1>
      </div>
      <a className="hbnf-home-link" href="https://hbnightflyers.com/" target="_blank" rel="noreferrer" aria-label="Open the independent HB Night Flyers website (opens in a new tab)">HBNF website <span aria-hidden="true">↗</span></a>
    </header>

    <nav className="hbnf-play-links" aria-label="HB Night Flyers scoring pages">
      {HBNF_DESTINATIONS.map(({ label, href }) => <a key={href} href={href} target="_blank" rel="noreferrer" aria-label={'Open HB Night Flyers ' + label + ' (opens in a new tab)'}>{label}<span aria-hidden="true">↗</span></a>)}
    </nav>

    <section className="hbnf-events" aria-labelledby="hbnf-events-title">
      <div className="hbnf-section-heading">
        <h2 id="hbnf-events-title">Events</h2>
        {!loading && !error ? <span>{upcomingEvents.length} upcoming</span> : null}
      </div>
      {loading ? <p className="hbnf-events-state" role="status">Loading events…</p> : null}
      {error ? <p className="hbnf-events-state" role="alert">HB Night Flyers events could not be loaded.</p> : null}
      {!loading && !error && upcomingEvents.length === 0 ? <p className="hbnf-events-state">No upcoming events are listed.</p> : null}
      {!loading && !error && upcomingEvents.length > 0 ? <ul className="hbnf-event-list">
        {upcomingEvents.map((event) => {
          const venue = [event.course_name || event.venue_name, event.city].filter(Boolean).join(' · ');
          return <li className="hbnf-event-row" key={event.id}>
            <time className="hbnf-event-date" dateTime={event.start_date}>{eventDateRange(event.start_date, event.end_date)}</time>
            <div className="hbnf-event-copy">
              <h3><a href={eventDetailPath(event)}>{event.name}</a></h3>
              {venue ? <p>{venue}</p> : null}
            </div>
            <a className="hbnf-event-detail" href={eventDetailPath(event)}>Details</a>
          </li>;
        })}
      </ul> : null}
    </section>

    <p className="hbnf-source-note">Event listings are published by Local Roots. Skins and Glow scoring stay on the independent HB Night Flyers website.</p>
  </main></Shell>;
}
