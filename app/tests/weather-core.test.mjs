import test from 'node:test';
import assert from 'node:assert/strict';
import courses from '../src/data/weather-courses.json' with { type: 'json' };
import { buildHourlyRows, distanceMiles, eligibleActiveAlerts, filterCourses, forecastFlags, gridSeriesValueAt, gridSpeedToMph, isEligibleCourse, summarizeHourly, zonedWindow } from '../src/lib/weatherCore.js';

const period=(startTime,endTime,v={})=>({startTime,endTime,temperature:v.temp,windSpeed:v.wind,windDirection:v.dir,probabilityOfPrecipitation:{value:v.rain},shortForecast:v.conditions});

test('course list has only sourced public disc golf layouts with at least 18 holes',()=>{
  assert.equal(courses.length,5);assert.ok(courses.every(isEligibleCourse));
  const bad=[{holes:9},{kind:'ball-golf'},{college:true},{status:'closed'},{access:'private',privateOnly:true},{sources:[]}];
  assert.ok(bad.every(change=>!isEligibleCourse({...courses[0],...change})));
});

test('radius filtering uses great-circle distance and removes closed courses',()=>{
  const center=[33.7004,-117.9919];
  const found=filterCourses([...courses,{...courses[0],id:'closed',status:'closed'}],center,80);
  assert.equal(found[0].id,'huntington-central-park');assert.equal(found[0].distanceMiles,0);
  assert.ok(found.some(c=>c.id==='prado-regional-park'));assert.ok(!found.some(c=>c.id==='coyote-point-lake-casitas'));
  assert.equal(filterCourses(courses,center,151).length,0);assert.ok(distanceMiles(center,courses[3].coordinates)>0);
});

test('time-window summary uses overlapping hours and actual gust grid intervals',()=>{
  const periods=[period('2026-10-17T14:00:00Z','2026-10-17T15:00:00Z',{temp:40,wind:'1 mph',dir:'N',rain:0,conditions:'Clear'}),period('2026-10-17T15:00:00Z','2026-10-17T16:00:00Z',{temp:50,wind:'5 mph',dir:'N',rain:0,conditions:'Clear'}),period('2026-10-17T16:00:00Z','2026-10-17T17:00:00Z',{temp:60,wind:'5 to 10 mph',dir:'NW',rain:20,conditions:'Cloudy'}),period('2026-10-17T17:00:00Z','2026-10-17T18:00:00Z',{temp:100,wind:'30 mph',dir:'S',rain:99,conditions:'Thunderstorms'})];
  const gusts=[{validTime:'2026-10-17T14:00:00Z/PT1H',value:8},{validTime:'2026-10-17T15:00:00Z/PT1H',value:12},{validTime:'2026-10-17T16:00:00Z/PT1H',value:20},{validTime:'2026-10-17T17:00:00Z/PT1H',value:40}];
  const result=buildHourlyRows(periods,gusts,{date:'2026-10-17',startHour:8,endHour:10,timeZone:'America/Los_Angeles',gustUnit:'wmoUnit:mile_h-1'});
  assert.equal(result.rows.length,2);assert.equal(result.coverage,1);
  assert.deepEqual(summarizeHourly(result.rows),{temperatureMinF:50,temperatureMaxF:60,windMinMph:5,windMaxMph:10,peakGustMph:20});
  assert.equal(result.rows[1].windDirection,'NW');assert.equal(result.rows[0].precipitationProbability,0);assert.equal(result.rows[0].conditions,'Clear');
});

test('gust grid intervals overlap hourly periods; missing gust and other fields remain null',()=>{
  const series=[{validTime:'2026-10-17T15:00:00Z/PT2H',value:25},{validTime:'2026-10-17T16:00:00Z/PT1H',value:null}];
  assert.equal(gridSeriesValueAt(series,Date.parse('2026-10-17T16:30:00Z'),Date.parse('2026-10-17T17:00:00Z')),25);
  assert.equal(gridSeriesValueAt(series,Date.parse('2026-10-17T18:00:00Z'),Date.parse('2026-10-17T19:00:00Z')),null);
  assert.ok(Math.abs(gridSpeedToMph(18.52,'wmoUnit:km_h-1')-11.51)<0.01);assert.equal(gridSpeedToMph(10,'wmoUnit:unsupported'),null);
  const partial=buildHourlyRows([period('2026-10-17T16:00:00Z','2026-10-17T17:00:00Z')],[],{date:'2026-10-17',startHour:8,endHour:12,timeZone:'America/Los_Angeles'});
  assert.equal(partial.coverage,0.25);assert.deepEqual(summarizeHourly(partial.rows),{temperatureMinF:null,temperatureMaxF:null,windMinMph:null,windMaxMph:null,peakGustMph:null});assert.equal(partial.rows[0].precipitationProbability,null);
});

test('forecast indicators are distinct from official NWS alerts and missing is not zero',()=>{
  const rows=[{temperatureF:96,windMinMph:21,windMaxMph:22,gustMph:31,precipitationProbability:60,conditions:'Thunderstorms likely'}];
  const flags=forecastFlags(rows,[{event:'Severe Thunderstorm Warning',headline:'NWS headline'}],true);
  assert.deepEqual(flags.map(x=>x.kind),['rain','wind','storm','heat','official']);assert.equal(flags.at(-1).source,'official');
  assert.ok(forecastFlags(rows,[],false).some(x=>x.kind==='alerts-unavailable'));
  assert.equal(forecastFlags([{temperatureF:null,windMinMph:null,windMaxMph:null,gustMph:null,precipitationProbability:null,conditions:null}],[],true).length,0);
});

test('official advisories are included only when their validity overlaps selected window',()=>{
  const window={start:Date.parse('2026-10-17T15:00:00Z'),end:Date.parse('2026-10-17T20:00:00Z')};
  const features=[{properties:{event:'Wind Advisory',onset:'2026-10-17T14:00:00Z',expires:'2026-10-17T18:00:00Z'}},{properties:{event:'Later',onset:'2026-10-17T20:00:00Z',expires:'2026-10-18T01:00:00Z'}},{properties:{event:'Expired',onset:'2026-10-17T10:00:00Z',expires:'2026-10-17T14:00:00Z'}}];
  assert.deepEqual(eligibleActiveAlerts(features,window).map(x=>x.event),['Wind Advisory']);
});

test('Pacific windows handle spring/fall DST, skipped local times, and all-day duration',()=>{
  const spring=zonedWindow('2026-03-08',1,4,'America/Los_Angeles');assert.equal((spring.end-spring.start)/3600000,2);
  const fall=zonedWindow('2026-11-01',0,4,'America/Los_Angeles');assert.equal((fall.end-fall.start)/3600000,5);
  const skipped=zonedWindow('2026-03-08',2,4,'America/Los_Angeles');assert.equal(skipped.adjustedForClockChange,true);
  assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric'}).format(skipped.start),'3 AM');
  assert.equal((zonedWindow('2026-11-01',0,24,'America/Los_Angeles').end-zonedWindow('2026-11-01',0,24,'America/Los_Angeles').start)/3600000,25);
  assert.throws(()=>zonedWindow('2026-10-17',16,8,'America/Los_Angeles'),RangeError);
});
