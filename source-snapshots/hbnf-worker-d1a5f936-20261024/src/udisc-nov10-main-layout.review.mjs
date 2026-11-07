// Review-only qualification for the observed Nov 10 UDisc Main layout.
// Raw historical snapshot modules remain untouched; this is an additive module.
export const NOV10_MAIN_LAYOUT = Object.freeze({
  eventId: 'hb-glow-doubles-af85rU',
  eventSlug: 'hb-night-flyers-hb-glow-doubles-af85rU',
  date: '2026-11-10',
  windowStart: '2026-11-11T01:30:00Z',
  windowEnd: '2026-11-11T07:30:00Z',
  courseId: 'A9Fe',
  courseName: 'Huntington Beach Central Park',
  layoutId: 14840,
  layoutName: 'Main',
  evidenceSha256: '8867bfc9a045cccd1b8c13ac5aaf5ef4de7072edbfa71dad67aed0fa8e4a3fa9',
  layoutSha256: '88fdf7aef88dcb467827b375dac9b747adb69d05c7e309d0cef50db492960b65',
  holes: Object.freeze([
    Object.freeze({ number: 1, distanceFeet: 274, par: 3 }),
    Object.freeze({ number: 2, distanceFeet: 310, par: 3 }),
    Object.freeze({ number: 3, distanceFeet: 214, par: 3 }),
    Object.freeze({ number: 4, distanceFeet: 277, par: 3 }),
    Object.freeze({ number: 5, distanceFeet: 206, par: 3 }),
    Object.freeze({ number: 6, distanceFeet: 346, par: 3 }),
    Object.freeze({ number: 7, distanceFeet: 335, par: 3 }),
    Object.freeze({ number: 8, distanceFeet: 332, par: 3 }),
    Object.freeze({ number: 9, distanceFeet: 314, par: 3 }),
    Object.freeze({ number: 10, distanceFeet: 299, par: 3 }),
    Object.freeze({ number: 11, distanceFeet: 283, par: 3 }),
    Object.freeze({ number: 12, distanceFeet: 308, par: 3 }),
    Object.freeze({ number: 13, distanceFeet: 309, par: 3 }),
    Object.freeze({ number: 14, distanceFeet: 288, par: 3 }),
    Object.freeze({ number: 15, distanceFeet: 249, par: 3 }),
    Object.freeze({ number: 16, distanceFeet: 427, par: 3 }),
    Object.freeze({ number: 17, distanceFeet: 316, par: 3 }),
    Object.freeze({ number: 18, distanceFeet: 348, par: 3 }),
  ]),
});

export function qualifyNov10MainWeek({ eventId, weekDate, week } = {}) {
  if (eventId !== NOV10_MAIN_LAYOUT.eventId || weekDate !== NOV10_MAIN_LAYOUT.date ||
      week?.eventId !== eventId || week?.date !== weekDate ||
      week?.eventWindow?.start !== NOV10_MAIN_LAYOUT.windowStart ||
      week?.eventWindow?.end !== NOV10_MAIN_LAYOUT.windowEnd ||
      week?.parLayout?.layoutId !== NOV10_MAIN_LAYOUT.layoutId ||
      week?.parLayout?.layoutName !== NOV10_MAIN_LAYOUT.layoutName ||
      week?.parLayout?.courseId !== NOV10_MAIN_LAYOUT.courseId ||
      week?.parLayout?.evidenceSha256 !== NOV10_MAIN_LAYOUT.evidenceSha256 ||
      week?.parLayout?.layoutSha256 !== NOV10_MAIN_LAYOUT.layoutSha256)
    return false;
  const pars = week?.scorecardText?.holePars;
  return pars && typeof pars === 'object' && !Array.isArray(pars) &&
    Object.keys(pars).length === NOV10_MAIN_LAYOUT.holes.length &&
    NOV10_MAIN_LAYOUT.holes.every(hole => String(pars[String(hole.number)] ?? '') === String(hole.par));
}
