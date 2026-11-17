export type LatLon = [number, number];
export type CourseRecord = { name: string; city?: string | null; coordinates?: number[] };
export type CourseIndex = { courses: { key: string; coordinates: number[] }[]; cityCentroid: Map<string, LatLon> };
type EventLike = { id: string; name: string; start_date: string; course_name?: string | null; venue_name?: string | null; city?: string | null };
export function haversineMiles(a: LatLon, b: LatLon): number;
export function buildCourseIndex(courses: CourseRecord[]): CourseIndex;
export function eventCoordinates(event: EventLike, index: CourseIndex): number[] | null;
export function distanceMilesTo(origin: LatLon, event: EventLike, index: CourseIndex): number | null;
export function compareByDistance(distances: Map<string, number | null>, a: EventLike, b: EventLike): number;
