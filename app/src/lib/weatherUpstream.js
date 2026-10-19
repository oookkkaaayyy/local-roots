import { filterCourses, eligibleActiveAlerts } from './weatherCore.js';

const NWS_AGENT = 'LocalRootsDiscGolfWeather/1.0 (https://localrootsdg.com/weather)';

function cacheRequest(baseUrl, key) {
  const url = new URL(`__weather-cache/${key}`, baseUrl);
  return new Request(url.toString());
}

function cacheStore(context) {
  return context?.caches?.default || globalThis.caches?.default || null;
}

export async function fetchJsonCached(url, context, ttlSeconds = 900, staleSeconds = 43200, headers = {}) {
  const cache = cacheStore(context);
  const base = context?.request?.url || 'https://localrootsdg.com/';
  const digest = encodeURIComponent(url);
  const freshKey = cacheRequest(base, `fresh?url=${digest}`);
  const staleKey = cacheRequest(base, `stale?url=${digest}`);
  const cached = cache ? await cache.match(freshKey) : null;
  if (cached) return { data: await cached.json(), fetchedAt: cached.headers.get('X-Weather-Fetched-At') || new Date().toISOString(), stale: false };

  try {
    const response = await fetch(url, { headers: { Accept: 'application/geo+json, application/json;q=0.9', 'User-Agent': NWS_AGENT, ...headers } });
    if (!response.ok) throw new Error(`Weather source returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!/json/i.test(contentType)) throw new Error('Weather source returned a non-JSON response.');
    const data = await response.json();
    const fetchedAt = new Date().toISOString();
    if (cache) {
      const body = JSON.stringify(data);
      const fresh = new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttlSeconds}`, 'X-Weather-Fetched-At': fetchedAt } });
      const stale = new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${staleSeconds}`, 'X-Weather-Fetched-At': fetchedAt } });
      await Promise.all([cache.put(freshKey, fresh), cache.put(staleKey, stale)]);
    }
    return { data, fetchedAt, stale: false };
  } catch (error) {
    const lastGood = cache ? await cache.match(staleKey) : null;
    if (lastGood) return { data: await lastGood.json(), fetchedAt: lastGood.headers.get('X-Weather-Fetched-At') || null, stale: true, error: error instanceof Error ? error.message : 'Weather source unavailable.' };
    throw error;
  }
}

async function mapLimit(items, limit, fn) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try { output[index] = { status: 'fulfilled', value: await fn(items[index], index) }; }
      catch (reason) { output[index] = { status: 'rejected', reason }; }
    }
  }));
  return output;
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } });
}

function pointUrl(lat, lon) {
  return `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export async function getWeatherResponse(request, context, courses) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const radius = Number(url.searchParams.get('radius') || 80);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(radius) || radius < 0 || radius > 150) {
    return jsonResponse({ error: 'Enter a valid location and a radius from 0 to 150 miles.' }, 400);
  }

  const nearbyAll = filterCourses(courses, [lat, lon], radius);
  const idsParam = url.searchParams.get('ids');
  const requestedIds = idsParam ? [...new Set(idsParam.split(',').filter(Boolean))] : nearbyAll.map((course) => course.id);
  if (requestedIds.length > 2) return jsonResponse({ error: 'Weather requests are limited to two courses per batch.' }, 400);
  const allowedIds = new Set(nearbyAll.map((course) => course.id));
  if (requestedIds.some((id) => !allowedIds.has(id))) return jsonResponse({ error: 'One or more requested courses are outside the selected radius or directory.' }, 400);
  const requested = new Set(requestedIds);
  const nearby = nearbyAll.filter((course) => requested.has(course.id));
  const coords = [...new Map(nearby.map((course) => [pointUrl(...course.coordinates), course.coordinates])).entries()];
  const pointResults = await mapLimit(coords, 2, async ([key, point]) => {
    const result = await fetchJsonCached(key, context, 86400, 7 * 86400);
    const props = result.data?.properties;
    if (!props?.forecastHourly || !props?.forecastGridData) throw new Error('NWS location does not provide hourly and grid forecasts.');
    if (!props.forecastHourly.startsWith('https://api.weather.gov/gridpoints/') || !props.forecastGridData.startsWith('https://api.weather.gov/gridpoints/')) throw new Error('NWS returned an unsupported forecast endpoint.');
    return { point, props, fetchedAt: result.fetchedAt, stale: result.stale };
  });
  const pointByCoordinate = new Map(coords.map(([key], index) => [key, pointResults[index]]));
  const pointForCourse = (course) => pointByCoordinate.get(pointUrl(...course.coordinates));
  const gridGroups = new Map();
  for (const course of nearby) {
    const pointResult = pointForCourse(course);
    if (pointResult?.status !== 'fulfilled') continue;
    const groupKey = pointResult.value.props.forecastHourly;
    if (!gridGroups.has(groupKey)) gridGroups.set(groupKey, { hourlyUrl: groupKey, gridUrl: pointResult.value.props.forecastGridData, ids: [] });
    gridGroups.get(groupKey).ids.push(course.id);
  }
  const groupResults = await mapLimit([...gridGroups.values()], 2, async (group) => {
    const [hourly, grid] = await Promise.allSettled([
      fetchJsonCached(group.hourlyUrl, context, 900, 12 * 3600),
      fetchJsonCached(group.gridUrl, context, 900, 12 * 3600),
    ]);
    return { group, hourly: hourly.status === 'fulfilled' ? hourly.value : null, hourlyError: hourly.status === 'rejected' ? String(hourly.reason?.message || hourly.reason) : null, grid: grid.status === 'fulfilled' ? grid.value : null, gridError: grid.status === 'rejected' ? String(grid.reason?.message || grid.reason) : null };
  });
  const groupById = new Map();
  for (const item of groupResults) if (item.status === 'fulfilled') for (const id of item.value.group.ids) groupById.set(id, item.value);

  const alertResults = await mapLimit(nearby, 2, async (course) => {
    const [latValue, lonValue] = course.coordinates;
    const result = await fetchJsonCached(`https://api.weather.gov/alerts/active?point=${latValue.toFixed(4)},${lonValue.toFixed(4)}`, context, 300, 3600);
    return { id: course.id, result };
  });
  const alertsById = new Map(alertResults.filter((r) => r.status === 'fulfilled').map((r) => [r.value.id, r.value.result]));

  const forecasts = Object.fromEntries(nearby.map((course) => {
    const point = pointForCourse(course);
    const group = groupById.get(course.id);
    if (point?.status !== 'fulfilled') return [course.id, { error: 'NWS location lookup failed. Try again later.', periods: [], gusts: [], precipitation: [], alerts: [], alertsAvailable: false, stale: false }];
    if (!group?.hourly || !Array.isArray(group.hourly.data?.properties?.periods)) return [course.id, { error: 'Hourly forecast is currently unavailable for this course.', periods: [], gusts: [], precipitation: [], alerts: [], alertsAvailable: false, stale: Boolean(group?.hourly?.stale) }];
    const alert = alertsById.get(course.id);
    const props = group.grid?.data?.properties || {};
    const lastUpdates = [group.hourly.data?.properties?.updateTime, group.grid?.data?.properties?.updateTime].filter((v) => typeof v === 'string');
    const times = lastUpdates.map(Date.parse).filter(Number.isFinite);
    const lastUpdatedAt = times.length ? new Date(Math.min(...times)).toISOString() : null;
    const apiAlerts = Array.isArray(alert?.data?.features) ? alert.data.features : [];
    return [course.id, {
      periods: group.hourly.data.properties.periods,
      gusts: props.windGust?.values || [],
      precipitation: props.probabilityOfPrecipitation?.values || [],
      precipitationUnit: props.probabilityOfPrecipitation?.uom || '',
      gustUnit: props.windGust?.uom || '',
      precipitation: props.probabilityOfPrecipitation?.values || [],
      precipitationUnit: props.probabilityOfPrecipitation?.uom || '',
      alerts: apiAlerts,
      alertsAvailable: Boolean(alert),
      lastUpdatedAt,
      stale: Boolean(point.value.stale || group.hourly.stale || group.grid?.stale || alert?.stale),
      staleMessage: [point.value.error, group.hourly.error, group.grid?.error || group.gridError, alert?.error].filter(Boolean).join(' '),
      partialError: group.gridError ? `Grid-derived gust and precipitation probability unavailable (${group.gridError})` : undefined,
    }];
  }));
  const responseUpdates = Object.values(forecasts).map((f) => Date.parse(f.lastUpdatedAt || '')).filter(Number.isFinite);
  return jsonResponse({
    courses: nearby,
    forecasts,
    lastSuccessfulUpdate: responseUpdates.length ? new Date(Math.min(...responseUpdates)).toISOString() : null,
    responseAt: new Date().toISOString(),
    courseDirectoryVerifiedOn: '2026-10-18',
  }, 200, { 'Cache-Control': 'private, no-store' });
}

export async function getGeocodeResponse(request, context) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('query') || '').trim();
  if (!/^\d{5}$/.test(query)) return jsonResponse({ error: 'Enter a 5-digit US ZIP code.' }, 400);
  try {
    const cached = await fetchJsonCached(`https://api.zippopotam.us/us/${query}`, context, 86400, 7 * 86400);
    const place = cached.data?.places?.[0];
    const lat = Number(place?.latitude);
    const lon = Number(place?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return jsonResponse({ error: `No US location matched ZIP ${query}.` }, 404);
    return jsonResponse({ query, label: [place['place name'], place['state abbreviation'], query].filter(Boolean).join(', '), coordinates: [lat, lon], source: 'Zippopotam.us ZIP lookup', fetchedAt: cached.fetchedAt, stale: cached.stale, staleMessage: cached.error || null });
  } catch {
    return jsonResponse({ error: `ZIP lookup is unavailable for ${query}. Your saved forecast may still be shown.` }, 503);
  }
}

export function handleWeatherGet(context, courses) {
  return getWeatherResponse(context.request, context, courses);
}

export function handleGeocodeGet(context) {
  return getGeocodeResponse(context.request, context);
}
