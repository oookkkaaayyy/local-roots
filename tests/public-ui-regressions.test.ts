// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), "utf8");

const publicSources = [
  source("pages/HomePage.tsx"),
  source("pages/EventsPage.tsx"),
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
  const events = source("pages/EventsPage.tsx");
  assert.ok(events.includes("return 'View PDGA results'"));
  assert.ok(events.includes("return 'View Disc Golf Scene results'"));
  assert.ok(events.includes("return 'View UDisc results'"));
  assert.ok(events.includes("return 'View HBNF results'"));
  assert.ok(events.includes("return 'View official results'"));
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
