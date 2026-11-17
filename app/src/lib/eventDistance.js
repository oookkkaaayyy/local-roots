const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

export function haversineMiles(a, b) {
  const R = 3958.7613;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function buildCourseIndex(courses) {
  const list = (courses ?? []).filter((c) => Array.isArray(c.coordinates) && c.coordinates.length === 2);
  const byCity = new Map();
  for (const c of list) {
    const key = norm(c.city);
    if (!key) continue;
    const entry = byCity.get(key) ?? [];
    entry.push(c.coordinates);
    byCity.set(key, entry);
  }
  const cityCentroid = new Map();
  for (const [key, pts] of byCity) {
    cityCentroid.set(key, [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]);
  }
  return { courses: list.map((c) => ({ key: norm(c.name), coordinates: c.coordinates })), cityCentroid };
}

export function eventCoordinates(event, index) {
  const names = [event.course_name, event.venue_name].map(norm).filter((n) => n.length >= 5);
  for (const name of names) {
    let best = null;
    for (const c of index.courses) {
      if (c.key.length < 5) continue;
      if (name.includes(c.key) || c.key.includes(name)) {
        if (!best || c.key.length > best.key.length) best = c;
      }
    }
    if (best) return best.coordinates;
  }
  return index.cityCentroid.get(norm(event.city)) ?? null;
}

export function distanceMilesTo(origin, event, index) {
  const coords = eventCoordinates(event, index);
  return coords ? haversineMiles(origin, coords) : null;
}

export function compareByDistance(distances, a, b) {
  const da = distances.get(a.id);
  const db = distances.get(b.id);
  if (da == null && db == null) return a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name);
  if (da == null) return 1;
  if (db == null) return -1;
  return da - db || a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name);
}
