import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { callFunction, supabase } from '../lib/supabase';
import { Shell } from '../components/Shell';

type ScheduledSourceReadiness = {
  source_id: string;
  source_key: string;
  daily_run_due: boolean;
  required_days: number;
  soak_complete: boolean;
  first_expected_date: string | null;
  latest_required_date: string | null;
  last_production_run_at: string | null;
  consecutive_healthy_days: number;
  first_gap_or_unhealthy_date: string | null;
};

type CountyCoverage = {
  county: string;
  published_total: number;
  current_future: number;
  next_event: string | null;
  latest_future: string | null;
};

type LaunchReadiness = {
  ready: boolean;
  checked_at: string;
  scheduled_sources: ScheduledSourceReadiness[];
  public_event_count: number;
  required_soak_days: number;
  scheduled_source_count: number;
  sanctioned_without_basis: number;
  published_without_provenance: number;
  blocking_high_or_critical_reviews: number;
  county_coverage: CountyCoverage[];
};

function Health({ ok, children }: { ok: boolean; children: string }) {
  return <span className={`health ${ok ? 'health-healthy' : 'health-warning'}`}>{children}</span>;
}

function dateLabel(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
}

export function ReadinessPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<LaunchReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(active: Session) {
    setLoading(true);
    setError('');
    try {
      setData(await callFunction<LaunchReadiness>('lr-launch-readiness', {}, active.access_token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load launch readiness.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase!.auth.getSession().then(({ data: auth }) => {
      setSession(auth.session);
      if (auth.session) void load(auth.session);
      else setLoading(false);
    });
    const { data: sub } = supabase!.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void load(next);
      else setData(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!session) {
    return <Shell admin><main className="content narrow"><div className="admin-login"><span className="eyebrow">Local Roots operations</span><h1>Launch status</h1><p>Sign in through the Events admin first.</p><a className="button primary" href="/admin/events">Go to admin sign-in</a></div></main></Shell>;
  }

  return <Shell admin><main className="content">
    <div className="admin-topbar"><div><span className="eyebrow">Launch gate</span><h1>{data?.ready ? 'Ready for launch' : 'Not ready yet'}</h1><p>{data ? `Checked ${new Date(data.checked_at).toLocaleString()}` : 'Checking production health…'}</p></div>{data ? <Health ok={data.ready}>{data.ready ? 'Ready' : 'Soak in progress'}</Health> : null}</div>
    {loading ? <div className="empty-state">Checking launch readiness…</div> : null}
    {error ? <div className="notice error">{error}</div> : null}
    {data ? <>
      <section className="source-grid">
        <article className="source-card"><div><h3>Published events</h3><span>Production corpus</span></div><strong>{data.public_event_count}</strong></article>
        <article className="source-card"><div><h3>Provenance</h3><span>Published without source basis</span></div><Health ok={data.published_without_provenance === 0}>{data.published_without_provenance === 0 ? 'Pass' : `${data.published_without_provenance} blocking`}</Health></article>
        <article className="source-card"><div><h3>Sanction basis</h3><span>Sanctioned without evidence</span></div><Health ok={data.sanctioned_without_basis === 0}>{data.sanctioned_without_basis === 0 ? 'Pass' : `${data.sanctioned_without_basis} blocking`}</Health></article>
        <article className="source-card"><div><h3>High-priority reviews</h3><span>High or critical open exceptions</span></div><Health ok={data.blocking_high_or_critical_reviews === 0}>{data.blocking_high_or_critical_reviews === 0 ? 'Pass' : `${data.blocking_high_or_critical_reviews} blocking`}</Health></article>
      </section>
      <section className="table-card"><table><thead><tr><th>Scheduled source</th><th>Healthy streak</th><th>Required</th><th>First expected</th><th>Last production run</th><th>Status</th></tr></thead><tbody>{data.scheduled_sources.map(src => <tr key={src.source_id}><td>{src.source_key}</td><td>{src.consecutive_healthy_days}</td><td>{src.required_days}</td><td>{src.first_expected_date ?? '—'}</td><td>{src.last_production_run_at ? new Date(src.last_production_run_at).toLocaleString() : 'Not yet'}</td><td><Health ok={src.soak_complete}>{src.soak_complete ? 'Soak complete' : src.first_gap_or_unhealthy_date ? `Broken ${src.first_gap_or_unhealthy_date}` : 'In progress'}</Health></td></tr>)}</tbody></table></section>
      <section className="table-card"><table><thead><tr><th>County</th><th>Published total</th><th>Current / future</th><th>Next event</th><th>Latest future event</th><th>Coverage</th></tr></thead><tbody>{data.county_coverage.map(row => <tr key={row.county}><td>{row.county}</td><td>{row.published_total}</td><td>{row.current_future}</td><td>{dateLabel(row.next_event)}</td><td>{dateLabel(row.latest_future)}</td><td><Health ok={row.current_future > 0}>{row.current_future > 0 ? 'Covered' : 'Gap'}</Health></td></tr>)}</tbody></table></section>
      <div className="button-row"><button className="button ghost" onClick={() => void load(session)}>Refresh</button><a className="button ghost" href="/admin/events">Back to event operations</a></div>
    </> : null}
  </main></Shell>;
}
