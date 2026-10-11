// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("../../app/src/components/Shell.tsx", import.meta.url), "utf8");

test("event detail routes keep Events marked as the current primary section", () => {
  assert.ok(shell.includes("path==='/events'||path.startsWith('/events/')"));
  assert.ok(shell.includes('href="/events" aria-current={eventsCurrent}'));
});

test("D&U public homepage has a discreet direct link to its protected admin queue", () => {
  assert.ok(shell.includes("path==='/dyed-and-unattached'?<a"));
  assert.ok(shell.includes('href="https://localrootsdg.com/admin/dyed-and-unattached"'));
  assert.ok(shell.includes('>Admin</a>:null'));
  assert.ok(shell.includes('{!admin?<footer'));
});
