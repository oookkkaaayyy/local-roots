// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), "utf8");

const publicSources = [
  source("pages/HomePage.tsx"),
  source("pages/EventsPage.tsx"),
  source("pages/EventDetailPage.tsx"),
  source("pages/HbnfPage.tsx"),
  source("pages/DyedUnattachedPage.tsx"),
  source("pages/NotFoundPage.tsx"),
  source("components/Shell.tsx"),
].join("\n");

test("rejected public marketing copy stays removed", () => {
  for (const rejected of [
    "Grown Local. Thrown Local.",
    "Local roots. Connected.",
    "One hub. Three ways in.",
    "Southern California disc golf, in one place.",
    "Ventura → San Diego",
    "Results not yet verified from an approved source.",
    "Custom disc-golf stencil portraits",
    "Turn a favorite pet photo into a bold portrait built for vinyl cutting and hand-dyed discs.",
    "From photo to disc",
    "See the transformation.",
    "Each example pairs the original reference with the finished artwork or dyed disc, so the likeness and final result are easy to compare.",
    "Start here",
    "No account required.",
    "The link may be outdated or the address may be incorrect.",
  ]) {
    assert.equal(publicSources.includes(rejected), false, `rejected copy returned: ${rejected}`);
  }
});

test("event submission is not a primary-navigation destination", () => {
  const shell = source("components/Shell.tsx");
  assert.equal(shell.includes('/events#submit'), false);
  assert.equal(shell.includes('Submit an event'), false);
});

test("event submission form remains available on Events page", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('id="submit"'));
  assert.ok(events.includes('SubmissionForm'));
  assert.ok(events.includes('className="submit-disclosure"'));
});

test("event submitter identity fields expose standard autocomplete purposes", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('name="submitter_name" maxLength={160} autoComplete="name"'));
  assert.ok(events.includes('name="submitter_email" maxLength={320} autoComplete="email"'));
});

test("event submission failures do not expose backend errors", () => {
  const events = source("pages/EventsPage.tsx");
  assert.equal(events.includes("err instanceof Error?err.message"), false);
  assert.equal(events.includes("setMessage(err"), false);
  assert.ok(events.includes("catch {setState('error');setMessage('The event could not be submitted.');}"));
});

test("repeated event actions have event-specific accessible names and disclose new-tab behavior", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('aria-label={`Registration for ${event.name} (opens in new tab)`}'));
  assert.ok(events.includes('aria-label={`Add ${event.name} to calendar`}'));
  assert.ok(events.includes('aria-label={`${resultLabel} for ${event.name} (opens in new tab)`}'));
});

test("event discovery controls expose upcoming/results views, search, and result-source filtering", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('aria-label="Event view"'));
  assert.ok(events.includes("aria-pressed={view==='upcoming'}"));
  assert.ok(events.includes("aria-pressed={view==='results'}"));
  assert.ok(events.includes('type="search"'));
  assert.ok(events.includes('<label>Results<select value={resultsFilter}'));
  assert.ok(events.includes('<option value="local">On Local Roots</option>'));
  assert.ok(events.includes('<option value="official">Official link</option>'));
  assert.ok(events.includes("resultsFilter==='local'&&!e.top_results?.length"));
  assert.ok(events.includes("resultsFilter==='official'&&!e.results_url"));
});

test("event discovery filters persist in the URL for bookmarkable views", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('new URLSearchParams(window.location.search)'));
  assert.ok(events.includes("params.set('view',view)"));
  assert.ok(events.includes("params.set('q',query.trim())"));
  assert.ok(events.includes("params.set('results',resultsFilter)"));
  assert.ok(events.includes("window.history.replaceState(null,'',next)"));
});

test("event search covers event, location, host, and TD fields", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes("[e.name,e.city,e.course_name,e.venue_name,e.club_host,...(e.td_names??[])]"));
  assert.ok(events.includes("haystack.includes(needle)"));
});

test("results link labels identify known destinations without importing their content", () => {
  const presentation = source("lib/eventPresentation.ts");
  assert.ok(presentation.includes("return 'PDGA Results ↗'"));
  assert.ok(presentation.includes("return 'Disc Golf Scene Results ↗'"));
  assert.ok(presentation.includes("return 'UDisc Results ↗'"));
  assert.ok(presentation.includes("return 'HBNF Results ↗'"));
  assert.ok(presentation.includes("return 'Official Results ↗'"));
});

test("event cards expose permanent detail URLs, filtered return state, and calendar actions", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('const detailHref=`${eventDetailPath(event)}?return=${encodeURIComponent(currentEventsPath())}`'));
  assert.ok(events.includes('href={detailHref}'));
  assert.ok(events.includes('className="event-title-link"'));
  assert.ok(events.includes('onClick={()=>downloadEventCalendar(event)}'));
  assert.ok(events.includes('>Add to Calendar</button>'));
  assert.ok(events.includes('>Full Results</a>'));
});

test("event detail route is permanent, canonical, and uses the detail RPC", () => {
  const app = source("App.tsx");
  const detail = source("pages/EventDetailPage.tsx");
  assert.ok(app.includes("path.startsWith('/events/')"));
  assert.ok(app.includes("canonical:normalized"));
  assert.ok(app.includes('<EventDetailPage slug={detailSlug}/>'));
  assert.ok(detail.includes("supabase!.rpc('lr_public_event_detail',{p_slug:slug})"));
  assert.ok(detail.includes('all_results'));
  assert.ok(detail.includes('groupResults(event.all_results??[])'));
});

test("events feed failures do not expose backend errors", () => {
  const events = source("pages/EventsPage.tsx");
  assert.equal(events.includes('setError(error.message)'), false);
  assert.equal(events.includes('Could not load events: {error}'), false);
  assert.ok(events.includes('if(error)setError(true)'));
  assert.ok(events.includes('>Could not load events.</div>'));
});

test("event detail failures do not expose backend errors and invalid slugs are noindexed", () => {
  const detail = source("pages/EventDetailPage.tsx");
  assert.equal(detail.includes('setError(error.message)'), false);
  assert.equal(detail.includes('<span>{error}</span>'), false);
  assert.ok(detail.includes("if(error)setError(true)"));
  assert.ok(detail.includes("robots.content='noindex,nofollow,noarchive'"));
  assert.ok(detail.includes('if(loading||event)return;'));
});

test("calendar downloads are all-day ICS files with exclusive end dates and canonical event URLs", () => {
  const presentation = source("lib/eventPresentation.ts");
  assert.ok(presentation.includes("'BEGIN:VCALENDAR'"));
  assert.ok(presentation.includes('`DTSTART;VALUE=DATE:${calendarDate(event.start_date)}`'));
  assert.ok(presentation.includes('`DTEND;VALUE=DATE:${calendarDate(addDays(event.end_date,1))}`'));
  assert.ok(presentation.includes('`UID:${event.id}@localrootsdg.com`'));
  assert.ok(presentation.includes("`${PUBLIC_ORIGIN}${eventDetailPath(event)}`"));
  assert.ok(presentation.includes("anchor.download=`${event.slug||'local-roots-event'}.ics`"));
});

test("HBNF external action discloses new-tab behavior without changing visible label", () => {
  const hbnf = source("pages/HbnfPage.tsx");
  assert.ok(hbnf.includes('aria-label="Open hbnightflyers.com (opens in new tab)"'));
  assert.ok(hbnf.includes('>Open hbnightflyers.com</a>'));
});

test("D&U request errors are assertive and all request status messages are atomic", () => {
  const du = source("pages/DyedUnattachedPage.tsx");
  assert.ok(du.includes("aria-live={state === 'error' ? 'assertive' : 'polite'}"));
  assert.ok(du.includes('aria-atomic="true"'));
});


test("owner-controlled copy policy remains explicit in source control", () => {
  const policy = readFileSync(new URL("../../docs/site-copy-policy.md", import.meta.url), "utf8");
  assert.ok(policy.includes("Do not invent promotional"));
  assert.ok(policy.includes("Prefer empty space"));
  assert.ok(policy.includes("explicitly approved"));
});

test("events page polish is scoped and HBNF cards expose first-party resources", () => {
  const events = source("pages/EventsPage.tsx");
  const detail = source("pages/EventDetailPage.tsx");
  const presentation = source("lib/eventPresentation.ts");
  const styles = source("events-enhancements.css");
  assert.ok(events.includes('<main className={`events-page ${landing?\'events-landing\':\'\'}`}>'));
  assert.ok(events.includes('>Details</a>'));
  assert.ok(events.includes("{filtered.length} shown · {viewEvents.length} {view==='upcoming'?'upcoming':'past'}"));
  assert.ok(events.includes('className="event-resource-links"'));
  assert.ok(detail.includes('className="event-resource-links"'));
  assert.ok(presentation.includes("https://hbnightflyers.com/"));
  assert.ok(presentation.includes("https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule"));
  assert.ok(presentation.includes("https://www.instagram.com/hbnightflyers/"));
  assert.ok(presentation.includes("https://www.facebook.com/HBNightFlyers/"));
  assert.ok(styles.includes('.events-page .hero h1'));
  assert.ok(styles.includes('.events-page .filters input,.events-page .filters select'));
});

test("event cards and detail pages expose permitted first-party official info without duplicating HBNF resources", () => {
  const events = source("pages/EventsPage.tsx");
  const detail = source("pages/EventDetailPage.tsx");
  const types = source("types.ts");
  assert.ok(types.includes("official_url: string | null"));
  assert.ok(events.includes("event.official_url&&!hbnfEvent"));
  assert.ok(events.includes(">Official Info ↗</a>"));
  assert.ok(events.includes("aria-label={`Official info for ${event.name} (opens in new tab)`}"));
  assert.ok(detail.includes("event.official_url&&!hbnfEvent"));
  assert.ok(detail.includes(">Official Info ↗</a>"));
});

test("the Local Roots landing page is the event utility, not the old three-card hub", () => {
  const app = source("App.tsx");
  const events = source("pages/EventsPage.tsx");
  const home = source("pages/HomePage.tsx");
  assert.ok(app.includes("if(path==='/')return <EventsPage landing/>;"));
  assert.equal(app.includes("import { HomePage }"), false);
  assert.ok(events.includes('<h1 className="sr-only">Southern California Disc Golf Events</h1>'));
  assert.equal(events.includes('<section className="hero"><h1>Southern California Disc Golf Events</h1></section>'), false);
  assert.ok(home.includes("branch-grid"));
});

test("public header gives Local Roots stronger brand hierarchy without a redundant Home nav item", () => {
  const shell = source("components/Shell.tsx");
  const styles = source("styles.css");
  assert.equal(shell.includes('className="nav-home"'), false);
  assert.ok(shell.includes("path==='/'||path==='/events'"));
  assert.ok(styles.includes(".public-brand-shell .brand-logo-mark{display:block;width:58px"));
  assert.ok(styles.includes(".public-brand-shell .brand strong{"));
});

test("Events visible typography is standardized on the site sans family", () => {
  const styles = source("events-enhancements.css");
  assert.ok(styles.includes(".events-page{font-family:var(--events-sans)}"));
  assert.ok(styles.includes(".event-detail-heading h1{font-family:var(--events-sans)"));
  assert.ok(styles.includes(".events-page .section-intro h2{font-size:1.55rem"));
});

test("refined Local Roots presentation uses one humanist UI family and stronger header lockup", () => {
  const shell = source("components/Shell.tsx");
  const styles = source("styles.css");
  const events = source("events-enhancements.css");
  assert.ok(shell.includes("admin?'admin-shell':'public-brand-shell'"));
  assert.ok(styles.includes('.public-brand-shell{'));
  assert.ok(styles.includes('--lr-ui:"Avenir Next"'));
  assert.ok(styles.includes('repeating-linear-gradient(7deg'))
  assert.ok(styles.includes('.public-brand-shell .brand-logo-mark{display:block;width:58px'))
  assert.ok(styles.includes('.public-brand-shell .brand strong{'));
  assert.ok(styles.includes('font-size:1.42rem'))
  assert.ok(styles.includes('.public-brand-shell .site-header nav a[aria-current="page"]'))
  assert.ok(events.includes('.events-page{--events-sans:"Avenir Next"'));
  assert.ok(events.includes('.events-page .event-main h3{font-size:1.03rem;font-weight:700'));
});

test("public brand audit does not add new marketing copy and includes D&U controls", () => {
  const shell = source("components/Shell.tsx");
  const styles = source("styles.css");
  const du = source("pages/DyedUnattachedPage.tsx");
  assert.ok(shell.includes("public-brand-shell"));
  assert.ok(styles.includes(".public-brand-shell .du-share-hero .branch-actions .button"));
  assert.ok(styles.includes(".public-brand-shell .du-request .section-intro h2"));
  assert.ok(du.includes(">Request a stencil</a>"));
  for (const rejected of ["Grown Local. Thrown Local.","Local roots. Connected.","Desert-grown disc goods"]) {
    assert.equal([shell,du,styles].join("\n").includes(rejected), false);
  }
});

test("HB Night Flyers is a footer link, not a primary navigation item", () => {
  const shell = source("components/Shell.tsx");
  assert.equal(shell.includes('className="nav-hbnf"'), false);
  assert.ok(shell.includes('<footer className="site-footer"><nav className="footer-nav" aria-label="Footer"><a href="https://hbnightflyers.com/">HB Night Flyers</a></nav></footer>'));
});

test("compact public navigation keeps Events and Dyed & Unattached visible", () => {
  const styles = source("styles.css");
  assert.ok(styles.includes(".site-header .nav-events,.site-header .nav-du{display:block}"));
});

test("past dates never imply verified completion in public status", () => {
  const events=source("pages/EventsPage.tsx");
  const detail=source("pages/EventDetailPage.tsx");
  const presentation=source("lib/eventPresentation.ts");
  assert.ok(events.includes("eventDisplayStatus(event,today)"));
  assert.ok(detail.includes("eventDisplayStatus(event,today)"));
  assert.ok(detail.includes("const canSubmitResults=event.status==='completed';"));
  assert.ok(presentation.includes("['completed','canceled','postponed'].includes(event.status)"));
  assert.ok(presentation.includes("event.end_date < today ? 'date_passed' : event.status"));
  assert.equal(events.includes("event.end_date<today ? 'completed'"),false);
  assert.equal(detail.includes("event.end_date<today?'completed'"),false);
});
