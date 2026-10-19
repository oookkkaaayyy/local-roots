import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Shell } from '../components/Shell';
import coursesData from '../data/weather-courses.json';
import { buildHourlyRows, eligibleActiveAlerts, filterCourses, forecastFlags, forecastWindowHasPassed, summarizeHourly } from '../lib/weatherCore.js';
import type { HourRow, WeatherCourse } from '../lib/weatherCore.js';

type Preferences = { location:string; radius:number; date:string; start:number; end:number; allDay:boolean; sort:'distance'|'temperature'|'wind'|'gust' };
type CourseForecast = { periods:unknown[]; gusts:unknown[]; precipitation?:Array<{validTime:string;value:number|null}>; precipitationUnit?:string; gustUnit?:string; alerts:unknown[]; alertsAvailable:boolean; lastUpdatedAt?:string|null; stale?:boolean; staleMessage?:string; partialError?:string; error?:string };
type WeatherResponse = { courses:Array<WeatherCourse & {distanceMiles:number}>; forecasts:Record<string,CourseForecast>; lastSuccessfulUpdate:string|null; responseAt:string; retrievedAt?:string|null };
type GeocodeResult = { coordinates:[number,number]; label:string; source:string; stale?:boolean; staleMessage?:string };
type CourseView = { course:WeatherCourse & {distanceMiles:number}; rows:HourRow[]; summary:ReturnType<typeof summarizeHourly>; coverage:number; alerts:ReturnType<typeof eligibleActiveAlerts>; alertsAvailable:boolean; flags:ReturnType<typeof forecastFlags>; error?:string; partialError?:string; stale?:boolean; lastUpdatedAt?:string|null };

const COURSES = coursesData as unknown as WeatherCourse[];
const PREF_KEY = 'lrWeatherPreferencesV1';
const LAST_KEY = 'lrWeatherLastGoodForecastV1';
const TIME_ZONE = 'America/Los_Angeles';
const HOUR_OPTIONS = Array.from({length:25},(_,i)=>i);

function dateInPacific(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const values = Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function plusDays(date:string,days:number) { const [y,m,d]=date.split('-').map(Number); return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10); }
function isCalendarDate(value:unknown): value is string { if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(`${value}T00:00:00.000Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value; }
function defaultPreferences():Preferences {
  const today=dateInPacific();
  const defaultDate=forecastWindowHasPassed(today,8,16,TIME_ZONE)?plusDays(today,1):today;
  const initial:Preferences={location:'92648',radius:80,date:defaultDate,start:8,end:16,allDay:false,sort:'distance'};
  try {
    const saved=JSON.parse(localStorage.getItem(PREF_KEY)||'null') as Partial<Preferences>|null;
    if(saved) Object.assign(initial,{location:/^\d{5}$/.test(saved.location||'')?saved.location:initial.location,radius:[25,50,80,100,125,150].includes(Number(saved.radius))?Number(saved.radius):80,start:Number.isInteger(saved.start)&&saved.start!>=0&&saved.start!<=22?saved.start:8,end:Number.isInteger(saved.end)&&saved.end!>0&&saved.end!<=24?saved.end:16,allDay:Boolean(saved.allDay),sort:['distance','temperature','wind','gust'].includes(saved.sort||'')?saved.sort:'distance',date:isCalendarDate(saved.date)?saved.date:initial.date});
  } catch { /* browser storage may be unavailable */ }
  const query=new URLSearchParams(window.location.search);
  const zip=query.get('zip'); if(zip&&/^\d{5}$/.test(zip)) initial.location=zip;
  const radius=Number(query.get('radius')); if([25,50,80,100,125,150].includes(radius)) initial.radius=radius;
  const sharedDate=query.get('date'); if(isCalendarDate(sharedDate)) initial.date=sharedDate;
  const startParam=query.get('start'); if(startParam!==null){const start=Number(startParam);if(Number.isInteger(start)&&start>=0&&start<=22)initial.start=start;}
  const endParam=query.get('end'); if(endParam!==null){const end=Number(endParam);if(Number.isInteger(end)&&end>initial.start&&end<=24)initial.end=end;}
  const allDayParam=query.get('allDay'); if(allDayParam==='1')initial.allDay=true;else if(allDayParam==='0')initial.allDay=false;
  return initial;
}
function labelHour(hour:number) { if(hour===24)return '12:00 AM'; const h=hour%12||12; return `${h}:00 ${hour<12?'AM':'PM'}`; }
function compactRange(min:number|null,max:number|null,unit:string) { return min===null||max===null?'—':`${Math.round(min)}–${Math.round(max)}${unit}`; }
function formatTime(value:string) { return new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,hour:'numeric',minute:'2-digit'}).format(new Date(value)); }
function formatUpdated(value?:string|null) { return value?new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,hour:'numeric',minute:'2-digit'}).format(new Date(value)):'Unavailable'; }
function formatForecastIssued(value?:string|null) { return value?new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):null; }
function weatherWindow(p:Preferences) { return p.allDay?{startHour:0,endHour:24}:{startHour:p.start,endHour:p.end}; }
function syncWeatherUrl(p:Preferences) { const url=new URL(window.location.href);url.pathname='/weather';url.search=new URLSearchParams({zip:p.location,radius:String(p.radius),date:p.date,start:String(p.start),end:String(p.end),allDay:p.allDay?'1':'0'}).toString();window.history.replaceState({},'',url); }
function extractHourRows(raw:CourseForecast|undefined,course:WeatherCourse,p:Preferences) {
  if(!raw||raw.error)return {rows:[] as HourRow[],coverage:0,adjusted:false};
  try { const result=buildHourlyRows(raw.periods,raw.gusts,{date:p.date,...weatherWindow(p),timeZone:course.timezone||TIME_ZONE,gustUnit:raw.gustUnit,precipitationSeries:raw.precipitation,precipitationUnit:raw.precipitationUnit}); return {rows:result.rows,coverage:result.coverage,adjusted:result.adjustedForClockChange}; }
  catch { return {rows:[] as HourRow[],coverage:0,adjusted:false}; }
}
function sortedCourses(views:CourseView[],sort:Preferences['sort']) {
  const copy=[...views];
  const value=(v:CourseView)=>sort==='temperature'?v.summary.temperatureMinF:sort==='wind'?v.summary.windMaxMph:sort==='gust'?v.summary.peakGustMph:v.course.distanceMiles;
  return copy.sort((a,b)=>{const av=value(a),bv=value(b);if(av===null||!Number.isFinite(av))return bv===null||!Number.isFinite(bv)?a.course.distanceMiles-b.course.distanceMiles:1;if(bv===null||!Number.isFinite(bv))return -1;return av-bv;});
}

export function WeatherPage() {
  const [preferences,setPreferences]=useState<Preferences>(defaultPreferences);
  const [draft,setDraft]=useState<Preferences>(defaultPreferences);
  const [center,setCenter]=useState<[number,number]|null>(null);
  const [result,setResult]=useState<WeatherResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [locationNotice,setLocationNotice]=useState('');
  const [expanded,setExpanded]=useState<string|null>(null);
  const [shareMessage,setShareMessage]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const [filtersOpen,setFiltersOpen]=useState(false);

  useEffect(()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(preferences));}catch{/* optional */}},[preferences]);
  useEffect(()=>{
    let cancelled=false;
    async function load() {
      setLoading(true);setError('');setLocationNotice('');
      try {
        let geo:GeocodeResult;
        const zip=preferences.location.trim();
        const response=await fetch(`/api/geocode?query=${encodeURIComponent(zip)}`,{headers:{Accept:'application/json'}});
        const body=await response.json();
        if(!response.ok)throw new Error(body.error||`Location lookup failed (${response.status}).`);
        geo=body as GeocodeResult;
        if(cancelled)return;
        setCenter(geo.coordinates);
        if(geo.stale)setLocationNotice('Location data may be old.');
        const key=`${geo.coordinates.join(',')}:${preferences.radius}`;
        let saved:WeatherResponse|null=null;
        try { const cache=JSON.parse(localStorage.getItem(LAST_KEY)||'null'); if(cache?.key===key&&Date.now()-Date.parse(cache.savedAt)<24*3600000)saved=cache.response as WeatherResponse; } catch { /* optional */ }
        const nearby=filterCourses(COURSES,geo.coordinates,preferences.radius);
        const weather:WeatherResponse={courses:nearby,forecasts:{},lastSuccessfulUpdate:null,responseAt:new Date().toISOString(),retrievedAt:null};
        setResult(weather);
        const batches=Array.from({length:Math.ceil(nearby.length/2)},(_,i)=>nearby.slice(i*2,i*2+2));
        let hadBatchFailure=false;
        for(let i=0;i<batches.length;i+=2){
          const results=await Promise.all(batches.slice(i,i+2).map(async batch=>{
            const ids=batch.map(course=>course.id).join(',');
            const url=`/api/weather?lat=${encodeURIComponent(geo.coordinates[0])}&lon=${encodeURIComponent(geo.coordinates[1])}&radius=${preferences.radius}&ids=${encodeURIComponent(ids)}`;
            const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
            const body=await response.json();
            if(!response.ok)throw new Error(body.error||`Forecast lookup failed (${response.status}).`);
            return {...body as WeatherResponse,retrievedAt:new Date().toISOString()};
          }).map(promise=>promise.catch(error=>({error}))));
          if(cancelled)return;
          for(let j=0;j<results.length;j++){
            const item=results[j] as WeatherResponse|{error:unknown};
            if('error' in item){
              hadBatchFailure=true;
              for(const course of batches[i+j])weather.forecasts[course.id]={periods:[],gusts:[],precipitation:[],alerts:[],alertsAvailable:false,error:item.error instanceof Error?item.error.message:'Forecast is unavailable.'};
              continue;
            }
            Object.assign(weather.forecasts,item.forecasts||{});
            if(item.retrievedAt&&(!weather.retrievedAt||Date.parse(item.retrievedAt)>Date.parse(weather.retrievedAt)))weather.retrievedAt=item.retrievedAt;
            if(item.lastSuccessfulUpdate&&(!weather.lastSuccessfulUpdate||Date.parse(item.lastSuccessfulUpdate)<Date.parse(weather.lastSuccessfulUpdate)))weather.lastSuccessfulUpdate=item.lastSuccessfulUpdate;
          }
          setResult({...weather});
        }
        if(cancelled)return;
        try{localStorage.setItem(LAST_KEY,JSON.stringify({key,zip:preferences.location,radius:preferences.radius,savedAt:new Date().toISOString(),response:weather}));}catch{/* optional cache */}
        setError('');
        if(geo.stale||hadBatchFailure||Object.values(weather.forecasts).some(x=>x.stale))setLocationNotice(hadBatchFailure?'Some forecasts unavailable.':'Showing cached data.');
      } catch(e) {
        if(cancelled)return;
        let saved:WeatherResponse|null=null;
        try { const cache=JSON.parse(localStorage.getItem(LAST_KEY)||'null'); if(cache?.zip===preferences.location&&cache?.radius===preferences.radius&&Date.now()-Date.parse(cache?.savedAt)<24*3600000)saved=cache.response as WeatherResponse; } catch { /* optional */ }
        if(saved){setResult(saved);setError('Forecast unavailable. Showing saved data.');}
        else {setResult(null);setError('Forecast unavailable.');}
      } finally {if(!cancelled)setLoading(false);}
    }
    void load();
    return ()=>{cancelled=true;};
  },[preferences.location,preferences.radius,refreshKey]);

  const views=useMemo(()=>{
    if(!center)return [] as CourseView[];
    const nearby=filterCourses(COURSES,center,preferences.radius);
    return nearby.map(course=>{
      const raw=result?.forecasts?.[course.id];
      const extracted=extractHourRows(raw,course,preferences);
      const summary=summarizeHourly(extracted.rows);
      let alerts:ReturnType<typeof eligibleActiveAlerts>=[];
      try{const {window}=buildHourlyRows(raw?.periods||[],raw?.gusts||[],{date:preferences.date,...weatherWindow(preferences),timeZone:course.timezone||TIME_ZONE,gustUnit:raw?.gustUnit});alerts=eligibleActiveAlerts(raw?.alerts||[],window);}catch{/* no comparable window */}
      const alertsAvailable=Boolean(raw?.alertsAvailable);
      return {course,rows:extracted.rows,summary,coverage:extracted.coverage,alerts,alertsAvailable,flags:forecastFlags(extracted.rows,alerts,alertsAvailable),error:raw?.error,partialError:raw?.partialError,stale:raw?.stale,lastUpdatedAt:raw?.lastUpdatedAt};
    });
  },[center,preferences,result]);
  const sorted=useMemo(()=>sortedCourses(views,preferences.sort),[views,preferences.sort]);

  function updateDraft<K extends keyof Preferences>(key:K,value:Preferences[K]) {
    setDraft(prev=>{
      if(key==='start'&&typeof value==='number'&&value>=prev.end)return {...prev,start:value,end:Math.min(24,value+1)};
      return {...prev,[key]:value};
    });
  }
  function submit(e:FormEvent) {
    e.preventDefault();
    if(!/^\d{5}$/.test(draft.location.trim())){setError('Enter a 5-digit US ZIP code.');return;}
    if(!draft.allDay&&draft.end<=draft.start){setError('End time must be later than start time.');return;}
    setPreferences({...draft,location:draft.location.trim()});setExpanded(null);setFiltersOpen(false);
    syncWeatherUrl({...draft,location:draft.location.trim()});
  }
  async function share() {
    const url=new URL(window.location.href);url.pathname='/weather';url.search=new URLSearchParams({zip:preferences.location,radius:String(preferences.radius),date:preferences.date,start:String(preferences.start),end:String(preferences.end),allDay:preferences.allDay?'1':'0'}).toString();
    try {if(navigator.share){await navigator.share({title:'Disc Golf Weather · Local Roots',url:url.toString()});return;}}catch(e){if(e instanceof Error&&e.name==='AbortError')return;}
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareMessage('Link copied.');
    } catch {
      const field=document.createElement('textarea');
      field.value=url.toString();field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';
      document.body.appendChild(field);field.select();
      const copied=document.execCommand('copy');field.remove();
      setShareMessage(copied?'Link copied.':'Link ready in address bar.');
    }
    setTimeout(()=>setShareMessage(''),2400);
  }
  const selectDateMin=dateInPacific();const selectDateMax=plusDays(selectDateMin,6);
  const selectedWindow=weatherWindow(preferences);const windowPassed=forecastWindowHasPassed(preferences.date,selectedWindow.startHour,selectedWindow.endHour,TIME_ZONE);
  function chooseNextAvailableWindow() {
    const next={...preferences,date:plusDays(selectDateMin,1),start:8,end:16,allDay:false};
    setPreferences(next);setDraft(next);setExpanded(null);setFiltersOpen(false);syncWeatherUrl(next);
  }

  return <Shell><main className="content weather-page">
    <section className="weather-heading"><div><h1>Disc Golf Weather</h1></div><button className="button ghost weather-share" type="button" onClick={()=>void share()} aria-label="Share this Weather search">Share</button></section>
    <section className="weather-filter">
      <button className="weather-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="weather-filters-panel" onClick={()=>setFiltersOpen(value=>!value)}>
        <strong>Filters</strong><span className="weather-filter-summary">{preferences.location} · {preferences.radius} mi · {new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,month:'short',day:'numeric'}).format(new Date(`${preferences.date}T12:00:00Z`))} · {preferences.allDay?'All day':`${labelHour(preferences.start).replace(':00','')}–${labelHour(preferences.end).replace(':00','')}`}</span><span className="weather-filter-chevron" aria-hidden="true">{filtersOpen?'−':'+'}</span>
      </button>
      <div id="weather-filters-panel" className="weather-filter-panel" hidden={!filtersOpen}>
      <form className="weather-controls" onSubmit={submit}>
      <label>ZIP<input inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} value={draft.location} onChange={e=>updateDraft('location',e.target.value.replace(/\D/g,'').slice(0,5))} aria-label="ZIP code for course search" /></label>
      <label>Miles<select value={draft.radius} onChange={e=>updateDraft('radius',Number(e.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={80}>80</option><option value={100}>100</option><option value={125}>125</option><option value={150}>150</option></select></label>
      <label>Date<input type="date" min={selectDateMin} max={selectDateMax} value={draft.date} onChange={e=>updateDraft('date',e.target.value)} /></label>
      <label>Start<select disabled={draft.allDay} value={draft.start} onChange={e=>updateDraft('start',Number(e.target.value))}>{HOUR_OPTIONS.slice(0,24).map(h=><option key={h} value={h}>{labelHour(h)}</option>)}</select></label>
      <label>End<select disabled={draft.allDay} value={draft.end} onChange={e=>updateDraft('end',Number(e.target.value))}>{HOUR_OPTIONS.slice(1).filter(h=>h>draft.start).map(h=><option key={h} value={h}>{labelHour(h)}</option>)}</select></label>
      <label className="weather-all-day"><input type="checkbox" checked={draft.allDay} onChange={e=>updateDraft('allDay',e.target.checked)} /> All Day</label>
      <button className="button primary weather-search" type="submit" disabled={loading}>Search</button>
    </form>
      </div>
    </section>
    {windowPassed?<div className="weather-window-expired" role="status"><span>This time window has passed.</span><button className="button primary" type="button" onClick={chooseNextAvailableWindow}>Tomorrow · 8 AM–4 PM</button></div>:null}
    <div className="weather-status" aria-live="polite">
      {loading?<span className="weather-status-dot">Loading…</span>:null}
      {error?<span className="weather-error">{error}</span>:null}
      {locationNotice?<span className="weather-stale">{locationNotice}</span>:null}
      {shareMessage?<span>{shareMessage}</span>:null}
    </div>
    {result?.retrievedAt?<p className="weather-updated weather-page-updated" aria-label="Forecast checked">Checked {formatUpdated(result.retrievedAt)}</p>:null}
    <div className="weather-results-heading"><h2>Courses</h2><span>{loading&&!result?'…':sorted.length}</span><label className="weather-sort">Sort<select aria-label="Sort courses" value={preferences.sort} onChange={e=>setPreferences(prev=>({...prev,sort:e.target.value as Preferences['sort']}))}><option value="distance">Distance</option><option value="temperature">Temp</option><option value="wind">Wind</option><option value="gust">Gust</option></select></label></div>
    <div className="weather-legend" aria-label="Forecast column headings"><span>Course</span><span>Temp</span><span>Wind · Gust</span><span>Conditions</span></div>
    <div className="weather-course-list">
      {!loading&&!error&&sorted.length===0?<div className="empty-state"><strong>No courses found within {preferences.radius} miles.</strong></div>:null}
      {sorted.map(view=>{
        const open=expanded===view.course.id;
        const temps=compactRange(view.summary.temperatureMinF,view.summary.temperatureMaxF,'°F');
        const winds=compactRange(view.summary.windMinMph,view.summary.windMaxMph,' mph');
        const currentConditions=[...new Set(view.rows.map(row=>row.conditions).filter((x):x is string=>Boolean(x)))].slice(0,2).join(' · ');
        const rowFlags=view.flags.filter(flag=>flag.kind!=='alerts-unavailable');
        return <article className={`weather-course ${open?'is-expanded':''}`} key={view.course.id}>
          <button className="weather-course-toggle" type="button" aria-expanded={open} aria-controls={`weather-details-${view.course.id}`} onClick={()=>setExpanded(open?null:view.course.id)}>
            <span className="weather-course-name"><strong>{view.course.name}</strong><small>{view.course.city}, {view.course.state} · {view.course.distanceMiles.toFixed(1)} mi</small></span>
            <span className="weather-metric" data-label="Temp"><strong>{view.error||!view.rows.length?'—':temps}</strong></span>
            <span className="weather-metric weather-wind-metric" data-label="Wind"><strong>{view.error||!view.rows.length?'—':winds}</strong><small>{view.summary.peakGustMph===null?'Gust —':`Gust ${Math.round(view.summary.peakGustMph)} mph`}</small></span>
            <span className="weather-condition-cell" data-label="Conditions">
              {view.error||!view.rows.length?<span>{view.error?'Forecast unavailable':'No forecast for these hours'}</span>:rowFlags.length?rowFlags.slice(0,2).map((flag,i)=><em className={`weather-flag flag-${flag.kind}`} key={`${flag.kind}-${i}`}>{flag.source==='official'?'NWS alert':flag.label}</em>):<span>{currentConditions||'Conditions unavailable'}</span>}
              {rowFlags.length>2?<small>+{rowFlags.length-2} more</small>:null}
            </span>
            <span className="weather-expand-indicator" aria-hidden="true">{open?'−':'+'}</span>
          </button>
          {open?<section className="weather-details" id={`weather-details-${view.course.id}`} aria-label={`Hourly forecast for ${view.course.name}`}>
            {view.error?<p className="weather-error">Forecast unavailable.</p>:null}
            {view.partialError?<p className="weather-stale">Some data unavailable.</p>:null}
            {view.stale?<p className="weather-stale">Cached forecast · Issued {formatForecastIssued(view.lastUpdatedAt)||'time unavailable'}</p>:view.lastUpdatedAt?<p className="weather-updated">Forecast issued {formatForecastIssued(view.lastUpdatedAt)}</p>:null}
            {!view.error&&view.rows.length===0?<p className="weather-muted">No forecast for these hours.</p>:null}
            {view.coverage>0&&view.coverage<0.999?<p className="weather-stale">Forecast covers {Math.round(view.coverage*100)}% of these hours.</p>:null}
            <div className="weather-hourly-scroll"><table className="weather-hourly"><thead><tr><th>Time</th><th>Temp</th><th>Wind</th><th>Gust</th><th>Rain</th><th>Conditions</th></tr></thead><tbody>{view.rows.map((row,i)=><tr key={`${row.startTime}-${i}`}><th scope="row">{formatTime(row.startTime)}</th><td>{row.temperatureF===null?'—':`${Math.round(row.temperatureF)}°F`}</td><td>{row.windMinMph===null?'—':`${Math.round(row.windMinMph)}–${Math.round(row.windMaxMph!)} mph ${row.windDirection||''}`}</td><td>{row.gustMph===null?'—':`${Math.round(row.gustMph)} mph`}</td><td>{row.precipitationProbability===null?'—':`${Math.round(row.precipitationProbability)}%`}</td><td>{row.conditions||'—'}</td></tr>)}</tbody></table></div>
            {view.flags.length?<div className="weather-flag-list"><strong>Alerts</strong>{view.flags.map((flag,i)=><p key={`${flag.kind}-${i}`}><span className={`weather-flag flag-${flag.kind}`}>{flag.source==='official'?'NWS alert':flag.label}</span>{flag.detail?<span>{flag.detail}</span>:null}</p>)}</div>:null}
            {!view.alertsAvailable?<p className="weather-stale">Alert status unavailable.</p>:null}
          </section>:null}
        </article>;
      })}
    </div>
  </main></Shell>;
}

