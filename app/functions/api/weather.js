import courses from '../../src/data/weather-courses.json';
import { handleWeatherGet } from '../../src/lib/weatherUpstream.js';

export async function onRequestGet(context) {
  return handleWeatherGet(context, courses);
}
