import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve("staging/coordinated-backend/hbnf-cart-control-opal-relay-v24");
const manifest = JSON.parse(readFileSync(resolve(root, "MANIFEST.json"), "utf8"));
const base = JSON.parse(readFileSync(resolve(root, "SOURCE_BASE.json"), "utf8"));
assert.equal(manifest.base_version, 23);
assert.equal(manifest.base_function_id, "95df7773-e888-48c9-84b3-ceb517c901c7");
assert.equal(manifest.base_ezbr_sha256, "716fff594b9de64aee2c3e3448bd1b683f42223ad32a17d7f24b82a458edfe45");
assert.equal(manifest.verify_jwt, false);
assert.deepEqual(Object.keys(manifest.files).sort(), [
  "deno.json", "guest-command.ts", "index.ts", "live.ts", "matrix-relay-auth.ts",
  "matrix-relay-projection.ts", "matrix-relay.ts", "runtime-vibe.ts", "skins_scoring.ts",
]);
for (const [name, expected] of Object.entries(manifest.files)) {
  assert.equal(createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex"), expected, `${name} hash mismatch`);
}
assert.equal(base.baseSha256, manifest.base_ezbr_sha256);
assert.equal(base.verify_jwt, false);

const { chooseLive, laDate } = await import(pathToFileURL(resolve(root, "live.ts")));
const date = laDate();
const state = { skins: { weeks: { [date]: {
  front: { cards: [{ playersText: "Ava\nBo", winners: { "1": "front_p_0" } }] },
  back: { cards: [{ teamsText: "Cy / Dee", winners: { "10": "back_team_0" } }] },
} } } };
assert.equal(chooseLive(state).label, "F9", "preloaded Back 9 must not become live before Front 9 lock");
state.skins.weeks[date].front.scoresLocked = true;
assert.equal(chooseLive(state).label, "B9", "Back 9 becomes live after Front 9 is locked");
state.skins.weeks[date].front.scoresLocked = false;
state.skins.weeks[date].front.cards[0].scoresLocked = true;
assert.equal(chooseLive(state).label, "B9", "all Front 9 cards locked also releases Back 9");

const index = readFileSync(resolve(root, "index.ts"), "utf8");
assert.match(index, /selectorVersion:\s*"skins-front-lock-v1"/);
assert.match(index, /isMatrixLiveReadPath\(requestUrl\.pathname\)/, "preserve current Matrix projection GET route");
assert.match(index, /if\(matrixLiveRead&&req\.method==="GET"\)/, "preserve Matrix read-only GET handler");
assert.match(index, /requiresOwnerAuthorization\(action, request\.type\)/, "preserve current controller command authorization path");
assert.match(index, /if \(req\.method !== "POST"&&!\(matrixLiveRead&&req\.method==="GET"\)\)/, "preserve existing controller POST behavior");
console.log("PASS: exact active-v23 release bundle retains all source hashes/verification settings and passes F9/B9 lock behavior while preserving Matrix GET and controller POST routes");
