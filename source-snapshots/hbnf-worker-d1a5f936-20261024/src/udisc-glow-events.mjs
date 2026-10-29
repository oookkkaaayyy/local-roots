const EVENT_ID = /^hb-night-flyers-[a-z0-9-]+-[A-Za-z0-9]{4,12}$/;

function decodeHtmlText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

export function parseUdiscGlowEvents(html) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('The UDisc schedule page is empty.');
  const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const events = new Map();
  const anchors = /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = anchors.exec(html))) {
    let link;
    try { link = new URL(match[3], 'https://udisc.com'); } catch { continue; }
    if (link.origin !== 'https://udisc.com') continue;
    const eventMatch = link.pathname.match(/^\/events\/([^/]+)\/leaderboard\/?$/);
    if (!eventMatch) continue;
    const eventId = eventMatch[1];
    if (!EVENT_ID.test(eventId) || !/glow/i.test(eventId) || /test/i.test(eventId)) continue;
    const label = decodeHtmlText(match[5]);
    const dateMatch = label.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})\b[\s\S]*?\b(20\d{2})\b/i);
    if (!dateMatch) continue;
    const month = months[dateMatch[1].toLowerCase()];
    const day = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const title = eventId.replace(/-[A-Za-z0-9]{4,12}$/, '').split('-').map(word => word ? word[0].toUpperCase()+word.slice(1) : '').join(' ');
    events.set(eventId, {eventId, date, title, url:`https://udisc.com/events/${eventId}/leaderboard`});
  }
  return [...events.values()].sort((a,b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title)).slice(0,25);
}
