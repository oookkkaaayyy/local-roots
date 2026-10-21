import assert from "node:assert/strict";
import { formatAcePotDisplay } from "../hbnf-final-controller/hbnf-cart-live-display.mjs";

assert.equal(formatAcePotDisplay({ event: "skins", acePot: 14 }), "ACE POOL 14 ENTRIES");
assert.equal(formatAcePotDisplay({ event: "glow", acePot: 500 }), "ACE POT $500");
assert.equal(formatAcePotDisplay({ event: "skins", acePot: Number.NaN }), "ACE POOL UNAVAILABLE");
assert.equal(formatAcePotDisplay({ event: "glow", acePot: -1 }), "ACE POT UNAVAILABLE");
assert.equal(formatAcePotDisplay({ event: "unknown", acePot: 5 }), "ACE VALUE UNAVAILABLE");

console.log("PASS: Cart live status and ace overlay preserve event-specific ace-pot units");
