import { handleGeocodeGet } from '../../src/lib/weatherUpstream.js';

export async function onRequestGet(context) {
  return handleGeocodeGet(context);
}
