import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseIndex, compareByDistance, distanceMilesTo, eventCoordinates, haversineMiles } from '../src/lib/eventDistance.js';

const courses = [
  { name: 'Huntington Beach Central Park Disc Golf Course', city: 'Huntington Beach', coordinates: [33.7004, -117.9919] },
  { name: 'Morley Field Disc Golf Course', city: 'San Diego', coordinates: [32.7376156, -117.1357555] },
  { name: 'Mast Park Disc Golf Course', city: 'Santee', coordinates: [32.8445, -116.9911] },
];
const index = buildCourseIndex(courses);

test('haversine is zero for identical points and plausible LA to SD', () => {
  assert.equal(haversineMiles([33, -117], [33, -117]), 0);
  const d = haversineMiles([34.05, -118.24], [32.72, -117.16]);
  assert.ok(d > 105 && d < 120, String(d));
});

test('matches by course name, falls back to city, else null', () => {
  assert.deepEqual(eventCoordinates({ course_name: 'Morley Field' }, index), [32.7376156, -117.1357555]);
  assert.deepEqual(eventCoordinates({ course_name: 'Unknown Park', city: 'Santee' }, index), [32.8445, -116.9911]);
  assert.equal(eventCoordinates({ course_name: null, city: 'Nowhere' }, index), null);
});

test('distance sort puts unknown last and ties fall back to date', () => {
  const origin = [32.75, -117.1];
  const events = [
    { id: 'a', name: 'A', start_date: '2026-12-01', course_name: 'Huntington Beach Central Park' },
    { id: 'b', name: 'B', start_date: '2026-12-05', course_name: 'Morley Field' },
    { id: 'c', name: 'C', start_date: '2026-12-02', course_name: 'Mystery' },
  ];
  const distances = new Map(events.map((e) => [e.id, distanceMilesTo(origin, e, index)]));
  const sorted = [...events].sort((x, y) => compareByDistance(distances, x, y)).map((e) => e.id);
  assert.deepEqual(sorted, ['b', 'a', 'c']);
});
