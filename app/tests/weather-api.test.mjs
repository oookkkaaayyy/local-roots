import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJsonCached, getGeocodeResponse, getWeatherResponse } from '../src/lib/weatherUpstream.js';

class MemoryCache { values=new Map();matches=0;puts=0;async match(r){this.matches++;return this.values.get(r.url)?.clone();}async put(r,v){this.puts++;this.values.set(r.url,v.clone());} }
function makeContext(url='https://preview.local/api/weather'){return {request:new Request(url),caches:{default:new MemoryCache()}};}
const courses=[
  {id:'public',name:'Public 18',coordinates:[33.7,-118],holes:18,kind:'disc-golf',access:'public',status:'open',timezone:'America/Los_Angeles',sources:[{url:'https://example.org/course'}]},
  {id:'short',name:'Short 9',coordinates:[33.7,-118],holes:9,kind:'disc-golf',access:'public',status:'open',sources:[{url:'https://example.org/course'}]},
];
function upstream(url){
  if(url.includes('/points/')){const group=url.includes('33.7500')?'TEST2/3,4':'TEST/1,2';return {properties:{forecastHourly:`https://api.weather.gov/gridpoints/${group}/forecast/hourly`,forecastGridData:`https://api.weather.gov/gridpoints/${group}`,updateTime:'2026-10-17T14:00:00Z'}};}
  if(url.endsWith('/forecast/hourly'))return {properties:{updateTime:'2026-10-17T14:00:00Z',periods:[{startTime:'2026-10-17T15:00:00Z',endTime:'2026-10-17T16:00:00Z',temperature:70,temperatureUnit:'F',windSpeed:'5 to 10 mph',windDirection:'NW',probabilityOfPrecipitation:{value:10},shortForecast:'Clear'}]}};
  if(url.endsWith('/TEST/1,2')||url.endsWith('/TEST2/3,4'))return {properties:{updateTime:'2026-10-17T14:00:00Z',windGust:{uom:'wmoUnit:km_h-1',values:[{validTime:'2026-10-17T15:00:00Z/PT1H',value:24.14}]},probabilityOfPrecipitation:{uom:'wmoUnit:percent',values:[{validTime:'2026-10-17T15:00:00Z/PT1H',value:70}]}}};
  if(url.includes('/alerts/active'))return {features:[]};
  throw new Error(`Unexpected URL ${url}`);
}

test('weather endpoint rejects invalid coordinates and radius over 150 miles',async()=>{
  const invalid=await getWeatherResponse(new Request('https://preview.local/api/weather?lat=91&lon=0&radius=80'),makeContext(),courses);assert.equal(invalid.status,400);
  const over=await getWeatherResponse(new Request('https://preview.local/api/weather?lat=33.7&lon=-118&radius=151'),makeContext(),courses);assert.equal(over.status,400);
});

test('ZIP endpoint rejects non-ZIP input without making a geocoder request',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('must not call upstream')};
  try{const response=await getGeocodeResponse(new Request('https://preview.local/api/geocode?query=city'),makeContext());assert.equal(response.status,400);}
  finally{globalThis.fetch=original;}
});

test('weather endpoint returns only eligible nearby courses and hourly, gust, and alert data',async t=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>new Response(JSON.stringify(upstream(String(url))),{status:200,headers:{'Content-Type':'application/geo+json'}});t.after(()=>{globalThis.fetch=original;});
  const response=await getWeatherResponse(new Request('https://preview.local/api/weather?lat=33.7&lon=-118&radius=25'),makeContext(),courses);assert.equal(response.status,200);
  const body=await response.json();assert.deepEqual(body.courses.map(c=>c.id),['public']);assert.equal(body.forecasts.public.periods[0].windDirection,'NW');assert.ok(Number.isFinite(Date.parse(body.responseAt)));assert.ok(Date.parse(body.responseAt)>=Date.parse(body.lastSuccessfulUpdate),'retrieval time follows the NWS forecast publication time');
  assert.equal(body.forecasts.public.gustUnit,'wmoUnit:km_h-1');assert.equal(body.forecasts.public.precipitation[0].value,70);assert.equal(body.forecasts.public.alertsAvailable,true);assert.equal(body.forecasts.short,undefined);
});

test('grid failure retains hourly data and clearly marks unavailable gusts',async t=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>String(url).endsWith('/TEST/1,2')?new Response('unavailable',{status:503}):new Response(JSON.stringify(upstream(String(url))),{status:200,headers:{'Content-Type':'application/geo+json'}});t.after(()=>{globalThis.fetch=original;});
  const response=await getWeatherResponse(new Request('https://preview.local/api/weather?lat=33.7&lon=-118&radius=25'),makeContext(),courses);const body=await response.json();
  assert.equal(body.forecasts.public.periods.length,1);assert.deepEqual(body.forecasts.public.gusts,[]);assert.match(body.forecasts.public.staleMessage,/HTTP 503/);assert.match(body.forecasts.public.partialError,/Grid-derived gust and precipitation probability unavailable/);
});

test('stale last-successful source is served explicitly when the upstream fails',async t=>{
  const cache=new MemoryCache();const ctx={request:new Request('https://preview.local/api/weather'),caches:{default:cache}};const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});await fetchJsonCached('https://api.weather.gov/test',ctx,900,3600);
  for(const key of [...cache.values.keys()])if(key.includes('/__weather-cache/fresh?'))cache.values.delete(key);
  globalThis.fetch=async()=>{throw new Error('offline');};t.after(()=>{globalThis.fetch=original;});
  const result=await fetchJsonCached('https://api.weather.gov/test',ctx,900,3600);assert.deepEqual(result.data,{ok:true});assert.equal(result.stale,true);
});

test('cold-cache weather batches stay below free Worker subrequest and cache-call caps',async t=>{
  const original=globalThis.fetch;let upstreamCalls=0;globalThis.fetch=async url=>{upstreamCalls++;return new Response(JSON.stringify(upstream(String(url))),{status:200,headers:{'Content-Type':'application/geo+json'}});};t.after(()=>{globalThis.fetch=original;});
  const cache=new MemoryCache();const ctx={request:new Request('https://preview.local/api/weather'),caches:{default:cache}};
  const third={...courses[0],id:'third',name:'Third',coordinates:[33.75,-118.01]};
  const request=new Request('https://preview.local/api/weather?lat=33.7&lon=-118&radius=25&ids=public,third');
  const response=await getWeatherResponse(request,ctx,[...courses,third]);
  assert.equal(response.status,200);const body=await response.json();assert.deepEqual(Object.keys(body.forecasts).sort(),['public','third']);
  assert.equal(upstreamCalls,8,`two locations on two grid groups require at most eight NWS fetches`);assert.ok(cache.matches+cache.puts<=50,`Cloudflare Cache API calls: ${cache.matches+cache.puts}`);
  const tooMany=await getWeatherResponse(new Request('https://preview.local/api/weather?lat=33.7&lon=-118&radius=25&ids=public,short,third'),ctx,[...courses,third]);
  assert.equal(tooMany.status,400);
});

test('warm-cache batch avoids duplicate NOAA requests and stale recovery remains reusable',async t=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{calls++;return new Response(JSON.stringify(upstream(String(url))),{status:200,headers:{'Content-Type':'application/geo+json'}});};t.after(()=>{globalThis.fetch=original;});
  const ctx=makeContext();await getWeatherResponse(new Request('https://preview.local/api/weather?lat=33.7&lon=-118&radius=25&ids=public'),ctx,courses);
  const coldCalls=calls;const second=await getWeatherResponse(new Request('https://preview.local/api/weather?lat=33.7&lon=-118&radius=25&ids=public'),ctx,courses);
  assert.equal(second.status,200);assert.equal(calls,coldCalls);
});


test('missing NWS publication time stays unknown instead of using request retrieval time',async t=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>{const value=upstream(String(url));if(value.properties)delete value.properties.updateTime;return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/geo+json'}});};t.after(()=>{globalThis.fetch=original;});
  const response=await getWeatherResponse(new Request('https://preview.local/api/weather?lat=33.7&lon=-118&radius=25'),makeContext(),courses);const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.lastSuccessfulUpdate,null);assert.equal(body.forecasts.public.lastUpdatedAt,null);assert.ok(Number.isFinite(Date.parse(body.responseAt)));
});
