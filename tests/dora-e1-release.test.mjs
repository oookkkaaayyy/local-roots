import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DORA_E1, isDoraE1FixtureDate, isDoraE1LinkedEvent } from "../supabase/functions/lr-sync-hbnf/dora-e1-quarantine.mjs";
import { CAPTURE_SQL, buildTransitionSql, preimageSha256, validatePreimage } from "../scripts/dora-e1-release.mjs";

const adapter = readFileSync(new URL("../supabase/functions/lr-sync-hbnf/index.ts", import.meta.url), "utf8");
const baseline = {
  event: {
    id: DORA_E1.eventId, slug: DORA_E1.slug, status: "completed",
    published: true, updated_at: "2026-11-04T00:00:00Z", name: "Glow",
  },
  links: [{
    id: "11111111-1111-4111-8111-111111111111",
    event_id: DORA_E1.eventId, source_id: DORA_E1.sourceId, external_id: DORA_E1.externalId,
  }],
  results: Array.from({ length: 6 }, (_, i) => ({
    id: "22222222-2222-4222-8222-" + String(i + 1).padStart(12, "0"),
    event_id: DORA_E1.eventId, source_id: DORA_E1.sourceId,
    player_name: "Fixture player " + (i + 1), place: i + 1, total_score: 54 + i,
  })),
};

test("only one exact fixture date and source/event identity are authorized", () => {
  assert.equal(isDoraE1FixtureDate("glow", "2026-09-02"), true);
  for (const [mode, date] of [["skins", "2026-09-02"], ["glow", "2026-09-03"], ["glow", "2026-11-03"]]) {
    assert.equal(isDoraE1FixtureDate(mode, date), false);
  }
  assert.equal(isDoraE1LinkedEvent(baseline.links[0], DORA_E1.sourceId), true);
  assert.equal(isDoraE1LinkedEvent(null, DORA_E1.sourceId), false);
  assert.throws(() => isDoraE1LinkedEvent({ event_id: "not-target" }, DORA_E1.sourceId), /mismatch/);
  assert.throws(() => isDoraE1LinkedEvent(baseline.links[0], "wrong-source"), /mismatch/);
});
test("Edge excludes the fixture before any candidate and result writes; only updates canonical published flag", () => {
  const exclude = adapter.indexOf('if (isDoraE1FixtureDate("glow", date)) continue;');
  const seen = adapter.indexOf("DORA_E1.externalId");
  const quarantine = adapter.indexOf('const quarantineE1 = await service.from("lr_events")');
  const candidate = adapter.indexOf('const candidateInsert = await service.from("lr_source_candidates")');
  const resultWrite = adapter.indexOf('const cleared = await service.from("lr_results").delete()');
  assert.ok(exclude > 0 && seen > exclude && quarantine > seen && candidate > quarantine && resultWrite > candidate);
  assert.match(adapter, /eq\("id", DORA_E1\.eventId\)[\s\S]{0,130}eq\("slug", DORA_E1\.slug\)[\s\S]{0,130}eq\("published", true\)/);
  assert.match(adapter, /fixture quarantine failed/);
});
test("read-only repeatable preimage captures all related rows and strictly validates provenance", () => {
  assert.match(CAPTURE_SQL, /REPEATABLE READ READ ONLY/);
  for (const table of ["public.lr_events", "public.lr_event_sources", "public.lr_results"]) {
    assert.ok(CAPTURE_SQL.includes(table));
  }
  assert.deepEqual(validatePreimage(baseline), baseline);
  assert.match(preimageSha256(baseline), /^[0-9a-f]{64}$/);
  const altered = structuredClone(baseline);
  altered.results[1].player_name = "Real player";
  assert.throws(() => validatePreimage(altered), /Fixture/);
  assert.throws(() => validatePreimage({ ...baseline, results: baseline.results.slice(1) }), /six results/);
  assert.throws(() => validatePreimage({ ...baseline, event: { ...baseline.event, published: false } }), /baseline/);
});
test("guarded apply and restore SQL compare full preimage, preserve result rows and never write other events", () => {
  const apply = buildTransitionSql(baseline, "apply");
  const restore = buildTransitionSql(baseline, "restore");
  for (const sql of [apply, restore]) {
    assert.match(sql, /^BEGIN;\nDO \$dora_e1\$/);
    assert.match(sql, /FOR UPDATE;/);
    assert.match(sql, /current_links IS DISTINCT FROM baseline->'links'/);
    assert.match(sql, /current_results IS DISTINCT FROM baseline->'results'/);
    assert.ok(sql.includes(DORA_E1.eventId));
    assert.ok(sql.includes(DORA_E1.slug));
    assert.ok(!/\bDELETE\b|\bTRUNCATE\b|\bINSERT\b/i.test(sql));
    assert.match(sql, /IF NOT FOUND THEN RAISE EXCEPTION/);
    assert.match(sql, /COMMIT;\n$/);
  }
  assert.match(apply, /UPDATE public\.lr_events SET published=false/);
  assert.match(restore, /UPDATE public\.lr_events SET published=true/);
});
test("offline idempotency and rollback simulation leaves six historical rows and real events unchanged", () => {
  const state = structuredClone(baseline);
  const other = { id: "legitimate-played-glow", published: true, status: "completed" };
  const preservedResults = structuredClone(state.results);
  const preservedLinks = structuredClone(state.links);
  const transition = (published) => { if (state.event.published !== published) state.event.published = published; };
  transition(false); transition(false);
  assert.equal(state.event.published, false);
  assert.deepEqual(state.results, preservedResults);
  assert.deepEqual(state.links, preservedLinks);
  assert.equal(other.published, true);
  transition(true); transition(true);
  assert.deepEqual(state, baseline);
});
