// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("../../app/src/components/Shell.tsx", import.meta.url), "utf8");

test("shared shell exposes one semantic main landmark at the skip-link target", () => {
  assert.ok(shell.includes('href="#main-content"'));
  assert.ok(shell.includes('<main id="main-content" tabIndex={-1}>{children}</main>'));
  assert.equal(shell.includes('<div id="main-content"'), false);
});
