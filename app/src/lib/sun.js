const RAD = Math.PI / 180;

function localMinutes(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
  const get = type => Number(parts.find(p => p.type === type)?.value);
  return get('hour') * 60 + get('minute');
}

export function formatMinutes(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function sunTimes(date, lat, lon, timeZone) {
  const [y, mo, d] = date.split('-').map(Number);
  const jd = Date.UTC(y, mo - 1, d, 12) / 86400000 + 2440587.5;
  const n = Math.ceil(jd - 2451545.0 + 0.0008);
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545.0 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const dec = Math.asin(sinDec);
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * Math.cos(dec));
  if (cosH > 1 || cosH < -1) return null;
  const h = Math.acos(cosH) / RAD;
  const toMs = j => (j - 2440587.5) * 86400000;
  const rise = toMs(transit - h / 360), set = toMs(transit + h / 360);
  return { sunriseMin: localMinutes(Math.round(rise / 60000) * 60000, timeZone), sunsetMin: localMinutes(Math.round(set / 60000) * 60000, timeZone) };
}
