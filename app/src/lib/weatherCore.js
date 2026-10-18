const MPH_PER_KPH = 0.6213711922;
const MPH_PER_MPS = 2.2369362921;
const MPH_PER_KNOT = 1.150779448;

export function distanceMiles(a, b) {
  const rad = (n) => (n * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isEligibleCourse(course) {
  return Boolean(course && course.kind === 'disc-golf' && Number.isInteger(course.holes) && course.holes >= 18 &&
    (/^(public|seasonal public)(?:$|[; ]|[-])/i.test(course.access || '') || course.access === 'public-fee') && (course.status === 'open' || course.status === 'INCLUDE') &&
    course.college !== true && course.privateOnly !== true && Array.isArray(course.coordinates) &&
    course.coordinates.length === 2 && course.coordinates.every(Number.isFinite) && Array.isArray(course.sources) && course.sources.length > 0);
}

export function filterCourses(courses, center, radiusMiles) {
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) || !Number.isFinite(radiusMiles) || radiusMiles < 0 || radiusMiles > 150) return [];
  return courses.filter(isEligibleCourse).map((course) => ({ ...course, distanceMiles: distanceMiles(center, course.coordinates) }))
    .filter((course) => course.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

function timezoneParts(epoch, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(epoch));
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}

function sameWall(parts, target) {
  return parts.year === target.year && parts.month === target.month && parts.day === target.day && parts.hour === target.hour && parts.minute === target.minute;
}

function wallMinuteEpoch(target, timeZone) {
  const utcWall = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const offsets = new Set();
  for (let d = -48; d <= 48; d += 6) {
    const sample = utcWall + d * 3600000;
    const p = timezoneParts(sample, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    offsets.add(asUtc - Math.floor(sample / 1000) * 1000);
  }
  const matches = [...offsets].map((offset) => utcWall - offset).filter((epoch) => sameWall(timezoneParts(epoch, timeZone), target)).sort((a, b) => a - b);
  return matches[0] ?? null; // Repeated DST hour: use its earlier occurrence.
}

export function zonedWindow(date, startHour, endHour, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const boundary = (hour) => {
    const wall = new Date(Date.UTC(year, month - 1, day, hour));
    for (let i = 0; i <= 180; i += 1) {
      const candidateDate = new Date(wall.getTime() + i * 60000);
      const target = { year: candidateDate.getUTCFullYear(), month: candidateDate.getUTCMonth() + 1, day: candidateDate.getUTCDate(), hour: candidateDate.getUTCHours(), minute: candidateDate.getUTCMinutes() };
      const epoch = wallMinuteEpoch(target, timeZone);
      if (epoch != null) return { epoch, adjusted: i > 0 };
    }
    throw new RangeError('Could not resolve local forecast time.');
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24 || endHour <= startHour) throw new RangeError('Choose a valid local time window.');
  const start = boundary(startHour);
  const end = boundary(endHour === 24 ? 24 : endHour);
  return { start: start.epoch, end: end.epoch, adjustedForClockChange: start.adjusted || end.adjusted };
}

function parseDurationMs(isoDuration) {
  const match = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(isoDuration || '');
  if (!match) return null;
  return (((Number(match[1] || 0) * 24 + Number(match[2] || 0)) * 60 + Number(match[3] || 0)) * 60 + Number(match[4] || 0)) * 1000;
}

export function gridSeriesValueAt(series, start, end, converter = (v) => v) {
  if (!Array.isArray(series)) return null;
  let max = null;
  for (const item of series) {
    if (!Number.isFinite(item?.value) || typeof item.validTime !== 'string') continue;
    const slash = item.validTime.lastIndexOf('/');
    if (slash < 0) continue;
    const intervalStart = Date.parse(item.validTime.slice(0, slash));
    const duration = parseDurationMs(item.validTime.slice(slash + 1));
    if (!Number.isFinite(intervalStart) || !Number.isFinite(duration) || duration <= 0 || intervalStart >= end || intervalStart + duration <= start) continue;
    const converted = converter(item.value);
    if (Number.isFinite(converted)) max = max === null ? converted : Math.max(max, converted);
  }
  return max;
}

export function gridSpeedToMph(value, unitCode = '') {
  if (unitCode.includes('km_h')) return value * MPH_PER_KPH;
  if (unitCode.includes('m_s')) return value * MPH_PER_MPS;
  if (unitCode.includes('kn')) return value * MPH_PER_KNOT;
  if (unitCode.includes('mile_h') || unitCode.toLowerCase().includes('mph')) return value;
  return null;
}

export function parseWindRangeMph(value) {
  if (typeof value !== 'string') return null;
  const numbers = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!numbers.length) return null;
  const unit = value.toLowerCase();
  let factor;
  if (unit.includes('km/h') || unit.includes('km per hour')) factor = MPH_PER_KPH;
  else if (unit.includes('m/s')) factor = MPH_PER_MPS;
  else if (unit.includes('knot')) factor = MPH_PER_KNOT;
  else if (unit.includes('mph') || unit.includes('mile per hour')) factor = 1;
  else return null;
  return [Math.min(...numbers) * factor, Math.max(...numbers) * factor];
}

export function buildHourlyRows(periods, gustSeries, options) {
  const window = zonedWindow(options.date, options.startHour, options.endHour, options.timeZone);
  const rows = (Array.isArray(periods) ? periods : []).flatMap((period) => {
    const start = Date.parse(period?.startTime);
    const end = Date.parse(period?.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= window.end || end <= window.start) return [];
    const wind = parseWindRangeMph(period.windSpeed);
    const gust = gridSeriesValueAt(gustSeries, start, end, (value) => gridSpeedToMph(value, options.gustUnit));
    const gridRain = ['wmoUnit:percent','%'].includes(options.precipitationUnit) ? gridSeriesValueAt(options.precipitationSeries, start, end, (value) => value >= 0 && value <= 100 ? value : null) : null;
    return [{
      startTime: period.startTime,
      endTime: period.endTime,
      temperatureF: Number.isFinite(period.temperature) && String(period.temperatureUnit).toUpperCase() === 'F' ? period.temperature : Number.isFinite(period.temperature) && String(period.temperatureUnit).toUpperCase() === 'C' ? period.temperature * 9 / 5 + 32 : null,
      windMinMph: wind?.[0] ?? null,
      windMaxMph: wind?.[1] ?? null,
      windDirection: typeof period.windDirection === 'string' && period.windDirection.trim() ? period.windDirection : null,
      gustMph: gust,
      precipitationProbability: gridRain ?? (Number.isFinite(period.probabilityOfPrecipitation?.value) ? period.probabilityOfPrecipitation.value : null),
      conditions: typeof period.shortForecast === 'string' && period.shortForecast.trim() ? period.shortForecast : null,
    }];
  }).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const clipped = rows.map((row) => [Math.max(window.start, Date.parse(row.startTime)), Math.min(window.end, Date.parse(row.endTime))]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let segmentStart = null;
  let segmentEnd = null;
  for (const [a, b] of clipped) {
    if (segmentEnd === null || a > segmentEnd) {
      if (segmentEnd !== null) covered += segmentEnd - segmentStart;
      [segmentStart, segmentEnd] = [a, b];
    } else segmentEnd = Math.max(segmentEnd, b);
  }
  if (segmentEnd !== null) covered += segmentEnd - segmentStart;
  return { rows, coverage: Math.min(1, covered / (window.end - window.start)), window, adjustedForClockChange: window.adjustedForClockChange };
}

export function summarizeHourly(rows) {
  const values = (key) => rows.map((row) => row[key]).filter(Number.isFinite);
  const temps = values('temperatureF');
  const windsMin = values('windMinMph');
  const windsMax = values('windMaxMph');
  const gusts = values('gustMph');
  return {
    temperatureMinF: temps.length ? Math.min(...temps) : null,
    temperatureMaxF: temps.length ? Math.max(...temps) : null,
    windMinMph: windsMin.length ? Math.min(...windsMin) : null,
    windMaxMph: windsMax.length ? Math.max(...windsMax) : null,
    peakGustMph: gusts.length ? Math.max(...gusts) : null,
  };
}

export function forecastFlags(rows, alerts, alertsAvailable = true) {
  const flags = [];
  if (rows.some((row) => (row.precipitationProbability ?? -1) >= 50)) flags.push({ kind: 'rain', label: 'Rain chance ≥50%', source: 'forecast' });
  const sustained = rows.flatMap((row) => [row.windMinMph, row.windMaxMph]).filter(Number.isFinite);
  const gusts = rows.map((row) => row.gustMph).filter(Number.isFinite);
  if (sustained.some((v) => v >= 20) || gusts.some((v) => v >= 30)) flags.push({ kind: 'wind', label: 'Strong wind or gusts', source: 'forecast' });
  if (rows.some((row) => /thunderstorm|thunderstorms|lightning/i.test(row.conditions || ''))) flags.push({ kind: 'storm', label: 'Thunderstorms', source: 'forecast' });
  if (rows.some((row) => Number.isFinite(row.temperatureF) && row.temperatureF >= 95)) flags.push({ kind: 'heat', label: 'Heat ≥95°F', source: 'forecast' });
  if (!alertsAvailable) flags.push({ kind: 'alerts-unavailable', label: 'Official alerts unavailable', source: 'status' });
  for (const alert of alerts || []) flags.push({ kind: 'official', label: alert.event || 'Official NWS alert', source: 'official', detail: alert.headline || alert.description || alert.event || 'Active NWS alert' });
  return flags;
}

export function eligibleActiveAlerts(features, selectedWindow) {
  if (!Array.isArray(features)) return [];
  return features.flatMap((feature) => {
    const p = feature?.properties || {};
    const eventStart = Date.parse(p.onset || p.effective || p.sent || '');
    const eventEnd = Date.parse(p.expires || p.ends || '');
    if ((Number.isFinite(eventEnd) && eventEnd <= selectedWindow.start) || (Number.isFinite(eventStart) && eventStart >= selectedWindow.end)) return [];
    return [{ event: p.event || null, headline: p.headline || null, severity: p.severity || null, description: p.description || null, expires: p.expires || null, area: p.areaDesc || null }];
  });
}
