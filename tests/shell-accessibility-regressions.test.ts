// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("../../app/src/components/Shell.tsx", import.meta.url), "utf8");
const events = readFileSync(new URL("../../app/src/pages/EventsPage.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../../app/src/pages/HomePage.tsx", import.meta.url), "utf8");

test("shared shell keeps the skip-link target without creating a nested main landmark", () => {
  assert.ok(shell.includes('href="#main-content"'));
  assert.ok(shell.includes('<div id="main-content" tabIndex={-1}>{children}</div>'));
  assert.equal(shell.includes('<main id="main-content"'), false);
  assert.ok(events.includes('<Shell><main>'));
  assert.ok(home.includes('<Shell><main>'));
});
