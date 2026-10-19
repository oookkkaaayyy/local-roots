import test from 'node:test';
import assert from 'node:assert/strict';
import courses from '../src/data/weather-courses.json' with { type: 'json' };
import { buildHourlyRows, buildRolling24HourRows, formatHourlyTimeLabel, distanceMiles, eligibleActiveAlerts, filterCourses, forecastFlags, gridSeriesValueAt, gridSpeedToMph, isEligibleCourse, summarizeHourly, zonedWindow, forecastWindowHasPassed } from '../src/lib/weatherCore.js';

const period=(startTime,endTime,v={})=>({startTime,endTime,temperature:v.temp,temperatureUnit:'F',windSpeed:v.wind,windDirection:v.dir,probabilityOfPrecipitation:{value:v.rain},shortForecast:v.conditions});

test('course list has only sourced public disc golf layouts with at least 18 holes',()=>{
  assert.equal(courses.length,35);assert.ok(courses.every(isEligibleCourse));
  const bad=[{holes:9},{kind:'ball-golf'},{college:true},{status:'closed'},{access:'private',privateOnly:true},{sources:[]}];
  assert.ok(bad.every(change=>!isEligibleCourse({...courses[0],...change})));
});

test('radius filtering uses great-circle distance and removes closed courses',()=>{
  const center=[33.7004,-117.9919];
  const found=filterCourses([...courses,{...courses[0],id:'closed',status:'closed'}],center,80);
  assert.equal(found[0].id,'huntington-central');assert.equal(found[0].distanceMiles,0);
  assert.ok(found.some(c=>c.id==='prado'));assert.ok(!found.some(c=>c.id==='coyote-point-lake-casitas'));
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

test('expired Pacific windows roll a fresh default from today to tomorrow at the exact end time',()=>{
  const end=zonedWindow('2026-10-18',8,16,'America/Los_Angeles').end;
  assert.equal(new Date(end).toISOString(),'2026-10-18T23:00:00.000Z');
  assert.equal(forecastWindowHasPassed('2026-10-18',8,16,'America/Los_Angeles',end-1),false);
  assert.equal(forecastWindowHasPassed('2026-10-18',8,16,'America/Los_Angeles',end),true);
  assert.equal(forecastWindowHasPassed('2026-10-19',8,16,'America/Los_Angeles',end),false);
  const fallEnd=zonedWindow('2026-11-01',8,16,'America/Los_Angeles').end;
  assert.equal(forecastWindowHasPassed('2026-11-01',8,16,'America/Los_Angeles',fallEnd),true);
});

test('Pacific windows handle spring/fall DST, skipped local times, and all-day duration',()=>{
  const spring=zonedWindow('2026-03-08',1,4,'America/Los_Angeles');assert.equal((spring.end-spring.start)/3600000,2);
  const fall=zonedWindow('2026-11-01',0,4,'America/Los_Angeles');assert.equal((fall.end-fall.start)/3600000,5);
  const skipped=zonedWindow('2026-03-08',2,4,'America/Los_Angeles');assert.equal(skipped.adjustedForClockChange,true);
  assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric'}).format(skipped.start),'3 AM');
  assert.equal((zonedWindow('2026-11-01',0,24,'America/Los_Angeles').end-zonedWindow('2026-11-01',0,24,'America/Los_Angeles').start)/3600000,25);
  assert.throws(()=>zonedWindow('2026-10-17',16,8,'America/Los_Angeles'),RangeError);
});

test('grid precipitation probability fills missing hourly values and preserves nulls',()=>{
  const rows=[period('2026-10-17T15:00:00Z','2026-10-17T16:00:00Z',{temp:60,wind:'5 mph',dir:'W',conditions:'Rain'})];
  const series=[{validTime:'2026-10-17T15:00:00Z/PT1H',value:70},{validTime:'2026-10-17T16:00:00Z/PT1H',value:null}];
  const result=buildHourlyRows(rows,[],{date:'2026-10-17',startHour:8,endHour:9,timeZone:'America/Los_Angeles',precipitationSeries:series,precipitationUnit:'wmoUnit:percent'});
  assert.equal(result.rows[0].precipitationProbability,70);
  const missing=buildHourlyRows([period('2026-10-17T16:00:00Z','2026-10-17T17:00:00Z')],[],{date:'2026-10-17',startHour:9,endHour:10,timeZone:'America/Los_Angeles',precipitationSeries:series,precipitationUnit:'wmoUnit:percent'});
  assert.equal(missing.rows[0].precipitationProbability,null);
});

test('fixed directory has accurate straight-line radius counts around ZIP 92648',()=>{
  const fromZip=[33.6757,-117.9980];
  const within=(radius)=>filterCourses(courses,fromZip,radius);
  assert.deepEqual([within(50).length,within(80).length,within(150).length],[15,23,35]);
  assert.ok(!courses.some(c=>/Kit Carson/.test(c.name)));assert.ok(courses.some(c=>/Sky High/.test(c.name)&&c.access.startsWith('public-fee')));assert.ok(courses.some(c=>c.id==='mt-waterman'&&c.access.startsWith('public-fee')));assert.ok(courses.some(c=>c.id==='ken-malloy'));
});

test('NWS temperature units convert Celsius and unknown wind units remain missing',()=>{
  const rows=buildHourlyRows([{startTime:'2026-10-17T15:00:00Z',endTime:'2026-10-17T16:00:00Z',temperature:20,temperatureUnit:'C',windSpeed:'10 furlongs',windDirection:'N',shortForecast:'Clear'}],[],{date:'2026-10-17',startHour:8,endHour:9,timeZone:'America/Los_Angeles'});
  assert.equal(rows.rows[0].temperatureF,68);assert.equal(rows.rows[0].windMinMph,null);
});


test('rolling forecast includes the current period and crosses midnight using available periods only',()=>{
  const periods=Array.from({length:26},(_,i)=>{const start=Date.parse('2026-10-18T06:00:00Z')+i*3600000;return period(new Date(start).toISOString(),new Date(start+3600000).toISOString(),{temp:60+i,wind:'5 to 10 mph',dir:'NW',rain:20,conditions:'Clear'});});
  const now=Date.parse('2026-10-18T06:30:00Z');const result=buildRolling24HourRows(periods,[],{now,timeZone:'America/Los_Angeles'});
  assert.equal(result.window.end-result.window.start,24*3600000);assert.equal(result.rows.length,25);assert.equal(result.rows[0].startTime,'2026-10-18T06:00:00.000Z');assert.equal(result.rows.at(-1).startTime,'2026-10-19T06:00:00.000Z');
  assert.match(formatHourlyTimeLabel(result.rows[0].startTime,result.rows,'America/Los_Angeles',now),/11:00 PM/);assert.match(formatHourlyTimeLabel(result.rows[1].startTime,result.rows,'America/Los_Angeles',now),/Sun, Oct 18, 12:00 AM/);
});

test('rolling detail labels spring DST and both repeated fall-back hours',()=>{
  const make=(from,count)=>Array.from({length:count},(_,i)=>{const start=Date.parse(from)+i*3600000;return period(new Date(start).toISOString(),new Date(start+3600000).toISOString(),{temp:55,wind:'5 mph',dir:'W',rain:0,conditions:'Clear'});});
  const springNow=Date.parse('2026-03-08T09:30:00Z');const spring=buildRolling24HourRows(make('2026-03-08T09:00:00Z',26),[],{now:springNow,timeZone:'America/Los_Angeles'});const springLabels=spring.rows.map(row=>formatHourlyTimeLabel(row.startTime,spring.rows,'America/Los_Angeles',springNow));
  assert.ok(springLabels.some(x=>x==='1:00 AM'));assert.ok(springLabels.some(x=>x==='3:00 AM'));assert.ok(!springLabels.some(x=>x.includes('Mar 8, 2:00 AM')));
  const fallNow=Date.parse('2026-11-01T08:30:00Z');const fall=buildRolling24HourRows(make('2026-11-01T08:00:00Z',26),[],{now:fallNow,timeZone:'America/Los_Angeles'});const repeated=fall.rows.map(row=>formatHourlyTimeLabel(row.startTime,fall.rows,'America/Los_Angeles',fallNow)).filter(x=>x.startsWith('1:00 AM'));
  assert.deepEqual(repeated,['1:00 AM PDT','1:00 AM PST']);assert.equal(fall.window.end-fall.window.start,24*3600000);
});

test('selected hours still control summaries while rolling hourly details preserve missing values',()=>{
  const periods=[period('2026-10-18T15:00:00Z','2026-10-18T16:00:00Z',{temp:65,wind:'5 mph',dir:'W',rain:0,conditions:'Clear'}),period('2026-10-18T16:00:00Z','2026-10-18T17:00:00Z',{temp:95,wind:'25 mph',dir:'S',rain:80,conditions:'Thunderstorms'})];
  const selected=buildHourlyRows(periods,[],{date:'2026-10-18',startHour:8,endHour:9,timeZone:'America/Los_Angeles'});const rolling=buildRolling24HourRows(periods,[],{now:Date.parse('2026-10-18T15:30:00Z'),timeZone:'America/Los_Angeles'});
  assert.deepEqual(summarizeHourly(selected.rows),{temperatureMinF:65,temperatureMaxF:65,windMinMph:5,windMaxMph:5,peakGustMph:null});assert.equal(rolling.rows.length,2);assert.equal(rolling.rows[1].temperatureF,95);
  const missing=buildRolling24HourRows([period('2026-10-18T15:00:00Z','2026-10-18T16:00:00Z')],[],{now:Date.parse('2026-10-18T15:30:00Z'),timeZone:'America/Los_Angeles'});assert.equal(missing.rows[0].temperatureF,null);assert.equal(missing.rows[0].windMinMph,null);assert.equal(missing.rows[0].precipitationProbability,null);
});
