import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObservedHtmlResponse } from './verify-live-routes.mjs';

test('strips only the specifically identified Cloudflare challenge script', () => {
  const html = '<!doctype html><html><body>page</body></html>';
  const challenge = '<script>(function(){function c(){var b=a.contentDocument;window.__CF$cv$params={};a.src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"}</script>';
  assert.deepEqual(normalizeObservedHtmlResponse(`${html.slice(0, -14)}${challenge}</body></html>`), {
    body: html,
    removedChallenge: true,
  });
});

test('preserves ordinary scripts within the document and unrelated trailing scripts', () => {
  const ordinary = '<html><body><script>const x = 1;</script></body></html>';
  assert.deepEqual(normalizeObservedHtmlResponse(ordinary), {
    body: ordinary,
    removedChallenge: false,
  });

  const trailing = '<html><body>page</body></html><script>const x = 1;</script>';
  assert.deepEqual(normalizeObservedHtmlResponse(trailing), {
    body: trailing,
    removedChallenge: false,
  });
});

test('does not normalize arbitrary content after a document without the exact signature', () => {
  const input = '<html><body>page<script>(function(){function c(){var b=a.contentDocument;return 1}}</script></body></html>';
  assert.deepEqual(normalizeObservedHtmlResponse(input), { body: input, removedChallenge: false });
});
