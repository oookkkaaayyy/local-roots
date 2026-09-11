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
});

test("event submitter identity fields expose standard autocomplete purposes", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('name="submitter_name" maxLength={160} autoComplete="name"'));
  assert.ok(events.includes('name="submitter_email" maxLength={320} autoComplete="email"'));
});

test("repeated event action links have event-specific accessible names and disclose new-tab behavior", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('aria-label={`Registration for ${event.name} (opens in new tab)`}'));
  assert.ok(events.includes('aria-label={`${resultLabel} for ${event.name} (opens in new tab)`}'));
});

test("event discovery controls expose upcoming/results views, search, and results availability", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('aria-label="Event view"'));
  assert.ok(events.includes("aria-pressed={view==='upcoming'}"));
  assert.ok(events.includes("aria-pressed={view==='results'}"));
  assert.ok(events.includes('type="search"'));
  assert.ok(events.includes('Results available'));
  assert.ok(events.includes("resultsFilter==='available'&&!hasResults(e)"));
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
  assert.ok(presentation.includes("return 'View PDGA results'"));
  assert.ok(presentation.includes("return 'View Disc Golf Scene results'"));
  assert.ok(presentation.includes("return 'View UDisc results'"));
  assert.ok(presentation.includes("return 'View HBNF results'"));
  assert.ok(presentation.includes("return 'View official results'"));
});

test("event cards expose permanent detail URLs and calendar actions", () => {
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes('href={eventDetailPath(event)}'));
  assert.ok(events.includes('className="event-title-link"'));
  assert.ok(events.includes('onClick={()=>downloadEventCalendar(event)}'));
  assert.ok(events.includes('>Add to Calendar</button>'));
});

test("event detail route is permanent, canonical, and uses only the public events RPC", () => {
  const app = source("App.tsx");
  const detail = source("pages/EventDetailPage.tsx");
  assert.ok(app.includes("path.startsWith('/events/')"));
  assert.ok(app.includes("canonical:normalized"));
  assert.ok(app.includes('<EventDetailPage slug={detailSlug}/>'));
  assert.ok(detail.includes("supabase!.rpc('lr_public_events')"));
  assert.ok(detail.includes("find(item=>item.slug===slug)"));
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
