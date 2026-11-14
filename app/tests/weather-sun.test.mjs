import test from 'node:test';
import assert from 'node:assert/strict';
import { sunTimes, formatMinutes } from '../src/lib/sun.js';

test('sunrise and sunset for Huntington Beach match published values within two minutes', () => {
  const tz = 'America/Los_Angeles';
  const expected = [['2026-11-14', 6 * 60 + 24, 16 * 60 + 49], ['2026-06-21', 5 * 60 + 42, 20 * 60 + 6], ['2026-12-21', 6 * 60 + 53, 16 * 60 + 48]];
  for (const [date, rise, set] of expected) {
    const s = sunTimes(date, 33.69, -117.99, tz);
    assert.ok(Math.abs(s.sunriseMin - rise) <= 2, `${date} sunrise ${formatMinutes(s.sunriseMin)}`);
    assert.ok(Math.abs(s.sunsetMin - set) <= 2, `${date} sunset ${formatMinutes(s.sunsetMin)}`);
  }
});
test('formatMinutes renders 12-hour clock', () => {
  assert.equal(formatMinutes(0), '12:00 AM');
  assert.equal(formatMinutes(16 * 60 + 49), '4:49 PM');
});
