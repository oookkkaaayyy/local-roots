import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const featurePath = new URL("hbnf-final-controller/hbnf-cart-features.mjs", root);
const featureSource = fs.readFileSync(featurePath, "utf8");
const helper = featureSource.match(/function compactShowScoreEntries\([\s\S]*?\n}\n(?=\nasync function showScoreboard)/);
assert.ok(helper, "Show Scores formatter exists in the shipped owner feature module");
const compact = new Function(`${helper[0]}; return compactShowScoreEntries;`)();

const front = compact("F9", ["Andrew Example 3", "Andrea Example 2", "Jordan Lee 1"]);
assert.deepEqual(front, ["AND1 3", "AND2 2", "JOR 1"]);
assert.ok(front.every(row => row.length <= 8));

const back = compact("B9", ["Andrew/Jordan 3", "Amelia/Jordan 2", "Alex/Alex 1"]);
assert.deepEqual(back, ["A1 / J 3", "A2 / J 2", "A / A2 1"]);
assert.ok(back.every(row => row.length <= 8));

const glow = compact("GLOW", ["Andrew/Jordan -1", "Alex Morgan E", "Alex Moore +2"]);
assert.deepEqual(glow, ["A / J -1", "ALE1 E", "ALE2 +2"]);
assert.ok(glow.every(row => row.length <= 8));

for(const size of [1,12,13,20]){
  const roster=compact("F9",Array.from({length:size},(_,i)=>`Player${i+1} ${i%10}`));
  assert.equal(roster.length,size,`all ${size} entries are preserved`);
}
const twenty = compact("F9", Array.from({ length: 20 }, (_, i) => `Player${i + 1} ${i % 10}`));
assert.equal(twenty[19], "PLAK 9");
assert.throws(() => compact("F9", Array.from({ length: 21 }, (_, i) => `Player${i + 1} ${i % 10}`)), /1–20 entries/);
assert.throws(() => compact("F9", ["NoScore"]), /could not be read/);
assert.throws(() => compact("UNKNOWN", ["Player 1"]), /not supported/);

assert.match(featureSource, /const ttl=Math\.ceil\(entries\.length\/2\)\*5500/);
assert.match(featureSource, /entries:entries\},ttl\)/);
assert.doesNotMatch(featureSource, /entries\.slice\(0,12\)/);

const firmware = fs.readFileSync(new URL("firmware/phase2/integration-r6-f89-compact-font/usermod/usermod_hbnf_foundation_v1.cpp", root), "utf8");
assert.match(firmware, /entryCount\+1u\)\/2u/);
assert.match(firmware, /elapsed\/kOwnerScoreboardPageDwellMs/);
assert.match(firmware, /hbnfDrawText\(overlay\.entries\[page\*2u\],1,scoreboardFg\)/);
assert.match(firmware, /hbnfDrawText\(overlay\.entries\[page\*2u\+1u\],10,scoreboardFg\)/);
assert.doesNotMatch(firmware, /hbnfDrawText\(overlay\.label,0,fg\)/);

const localUi = fs.readFileSync(new URL("firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_local_ui.h", root), "utf8");
assert.match(localUi, /entries\.length>20/);
assert.doesNotMatch(localUi, /entries\.slice\(0,12\)/);
console.log("PASS: owner Show Scores preserves up to 20 entries, uses short unambiguous labels, and budgets 5.5 seconds per two-row page; firmware source renders a full cycle without a header");
