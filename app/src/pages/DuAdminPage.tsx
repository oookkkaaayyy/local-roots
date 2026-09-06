import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { callFunction, supabase } from '../lib/supabase';
import { Shell } from '../components/Shell';

type WorkflowStatus = 'draft'|'intake_complete'|'handoff_preparing'|'chatgpt_ready'|'notification_sent'|'stage_a_started'|'awaiting_art_approval'|'art_approved'|'production_ready'|'complete'|'handoff_failed';
type JobSummary = {
  id:string; job_number:string; client_name:string|null; phone:string|null; email:string|null;
  subject_name:string|null; subject_type:string; notes:string|null; created_at:string; updated_at:string;
  workflow_status:WorkflowStatus; source_photo_count:number; handoff_ready_at:string|null;
  notification_sent_at:string|null; handoff_last_error:string|null; handoff_retry_count:number;
};
type Photo = {id:string; original_filename:string|null; sort_order:number; signed_url:string|null};
type JobDetail = {job:JobSummary;photos:Photo[];options:Array<{option_code:string;prompt:string}>;checklist:Record<string,unknown>|null};
type Dashboard = {admin:{display_name:string|null;role:string};jobs:JobSummary[]};
type PushConfig = {public_key:string;subscription_count:number};
type PushTest = {ok:boolean;sent:number};
type BadgeNavigator = Navigator & {
  standalone?: boolean;
  setAppBadge?: (contents?:number)=>Promise<void>;
  clearAppBadge?: ()=>Promise<void>;
};

const labels:Record<WorkflowStatus,string>={draft:'Draft',intake_complete:'Intake complete',handoff_preparing:'Preparing handoff',chatgpt_ready:'ChatGPT ready',notification_sent:'Notified',stage_a_started:'Stage A started',awaiting_art_approval:'Awaiting art approval',art_approved:'Art approved',production_ready:'Production ready',complete:'Complete',handoff_failed:'Handoff failed'};
const activeStates:WorkflowStatus[]=['intake_complete','handoff_preparing','chatgpt_ready','notification_sent','stage_a_started','awaiting_art_approval','art_approved','production_ready','handoff_failed'];

function isIos(){return /iPad|iPhone|iPod/.test(navigator.userAgent);}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||(navigator as BadgeNavigator).standalone===true;}
function urlBase64ToUint8Array(value:string){
  const padding='='.repeat((4-(value.length%4))%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=window.atob(base64);
  return Uint8Array.from(raw,character=>character.charCodeAt(0));
}
function ensureDuPwaMetadata(){
  const created:HTMLElement[]=[];
  if(!document.querySelector('link[data-du-manifest]')){
    const manifest=document.createElement('link');manifest.rel='manifest';manifest.href='/du-manifest.webmanifest';manifest.dataset.duManifest='true';document.head.appendChild(manifest);created.push(manifest);
  }
  const metas:[string,string][]=[['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-title','D&U'],['apple-mobile-web-app-status-bar-style','default'],['mobile-web-app-capable','yes']];
  for(const [name,content] of metas){
    if(document.querySelector(`meta[name="${name}"]`))continue;
    const meta=document.createElement('meta');meta.name=name;meta.content=content;meta.dataset.duPwa='true';document.head.appendChild(meta);created.push(meta);
  }
  return()=>created.forEach(element=>element.remove());
}

function Login({targetJob}:{targetJob:string|null}){
  const [email,setEmail]=useState(''),[message,setMessage]=useState(''),[sending,setSending]=useState(false);
  async function submit(event:FormEvent){
    event.preventDefault();setSending(true);
    const redirect=new URL('/admin/dyed-and-unattached',window.location.origin);
    if(targetJob)redirect.searchParams.set('job',targetJob);
    const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirect.toString()}});
    setMessage(error?error.message:'Check your email for the secure sign-in link.');setSending(false);
  }
  return <div className="admin-login"><span className="eyebrow">Dyed &amp; Unattached operations</span><h1>Production queue</h1><p>Authorized reviewers only. Sign in with a magic link.</p><form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="button primary" disabled={sending}>{sending?'Sending…':'Send sign-in link'}</button></form>{message?<div className="notice">{message}</div>:null}</div>;
}

function stagePrompt(detail:JobDetail){
  const job=detail.job;
  const photoWord=detail.photos.length===1?'photo':'photos';
  return `MAKE A DISC-GOLF STENCIL — ${job.job_number}\n\nUse the ${detail.photos.length} attached source ${photoWord} as the only identity/anatomy reference for ${job.subject_name||'this subject'}.\n\nCreate one clean black-and-white stencil portrait directly from the source ${photoWord}. Preserve the exact subject's identity, natural proportions, expression, asymmetry, eyes, ears, muzzle/nose, head shape, and distinctive markings. Use a head-dominant composition on a plain white background with bold connected black shapes, medium-scale negative space, and moderate detail. Remove background, body, and collar unless essential to recognition. Avoid cartooning, generic breed-icon simplification, scratchboard texture, stippling, micro-speckle, tiny decorative marks, artificial borders, and geometry from any rejected prior candidate.\n\nSubmission notes: ${job.notes||'None'}\n\nDo not run legacy Stage-A admission, best-of-N, semantic-master, benchmark-conditioning, raw-normalization, or machine semantic-PASS workflows. Compare the result directly with the source before presenting it. If it plainly does not resemble the source, reject it rather than calling it passed. Show one serious artwork candidate only.`;
}

function JobCard({job,session,refresh,autoOpen}:{job:JobSummary;session:Session;refresh:()=>void;autoOpen:boolean}){
  const [detail,setDetail]=useState<JobDetail|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const load=useCallback(async()=>{setBusy(true);setMessage('');try{setDetail(await callFunction<JobDetail>('du-admin',{action:'job',job_id:job.id},session.access_token));}catch(error){setMessage(error instanceof Error?error.message:'Could not load job.');}finally{setBusy(false);}},[job.id,session.access_token]);
  useEffect(()=>{if(!autoOpen)return;void load();const timer=window.setTimeout(()=>document.getElementById(job.job_number)?.scrollIntoView({behavior:'smooth',block:'start'}),100);return()=>window.clearTimeout(timer);},[autoOpen,job.job_number,load]);
  async function setWorkflow(workflow_status:WorkflowStatus){setBusy(true);setMessage('');try{await callFunction('du-admin',{action:'set_workflow',job_id:job.id,workflow_status,clear_handoff_error:true},session.access_token);setMessage(`Moved to ${labels[workflow_status]}.`);refresh();}catch(error){setMessage(error instanceof Error?error.message:'Update failed.');}finally{setBusy(false);}}
  async function copyPrompt(){if(!detail)await load();const current=detail??await callFunction<JobDetail>('du-admin',{action:'job',job_id:job.id},session.access_token);await navigator.clipboard.writeText(stagePrompt(current));setDetail(current);setMessage('ChatGPT prompt copied. Download the source photos below, attach them together, and paste.');}
  async function prepareForChatGPT(){
    setBusy(true);setMessage('');
    try{
      const current=detail??await callFunction<JobDetail>('du-admin',{action:'job',job_id:job.id},session.access_token);
      setDetail(current);
      const files=await Promise.all(current.photos.map(async(photo,index)=>{
        if(!photo.signed_url)throw new Error(`Source ${index+1} is unavailable.`);
        const response=await fetch(photo.signed_url);
        if(!response.ok)throw new Error(`Source ${index+1} could not be retrieved.`);
        const blob=await response.blob();
        const fallback=`${job.job_number}-source-${String(index+1).padStart(2,'0')}.jpg`;
        return new File([blob],photo.original_filename||fallback,{type:blob.type||'image/jpeg'});
      }));
      const prompt=stagePrompt(current);
      await navigator.clipboard.writeText(prompt);
      const shareData={title:`${job.job_number} · ${job.subject_name||'D&U stencil'}`,text:prompt,files};
      if(navigator.share&&navigator.canShare?.({files})){
        await navigator.share(shareData);
        await callFunction('du-admin',{action:'set_workflow',job_id:job.id,workflow_status:'stage_a_started',clear_handoff_error:true},session.access_token);
        setMessage('Handoff shared. ChatGPT received the sources; the stencil prompt is also on your clipboard.');
        refresh();
        return;
      }
      for(const file of files){const href=URL.createObjectURL(file);const anchor=document.createElement('a');anchor.href=href;anchor.download=file.name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);}
      setMessage('Source downloads started and prompt copied. In ChatGPT, attach all downloaded images together and paste.');
    }catch(error){if(error instanceof DOMException&&error.name==='AbortError')setMessage('Share cancelled; nothing was changed.');else setMessage(error instanceof Error?error.message:'Could not prepare the ChatGPT handoff.');}
    finally{setBusy(false);}
  }
  return <article className="admin-card du-job-card" id={job.job_number}>
    <div className="admin-card-head"><div><h3>{job.job_number} · {job.subject_name||'Unnamed pet'}</h3><p>{job.client_name||'Unknown client'} · {new Date(job.created_at).toLocaleString()}</p></div><div className="pill-row"><span className={`health health-${job.workflow_status==='handoff_failed'?'critical':job.workflow_status==='complete'?'healthy':'warning'}`}>{labels[job.workflow_status]}</span><span className="status-pill">{job.source_photo_count} photo{job.source_photo_count===1?'':'s'}</span></div></div>
    {job.notes?<p className="admin-notes">{job.notes}</p>:null}
    {job.handoff_last_error?<div className="notice error"><strong>Handoff error</strong><span>{job.handoff_last_error}</span></div>:null}
    <div className="button-row"><button className="button ghost" disabled={busy} onClick={()=>detail?setDetail(null):void load()}>{busy?'Preparing…':detail?'Hide details':'Open job'}</button><button className="button primary" disabled={busy} onClick={()=>void prepareForChatGPT()}>Start Stencil</button><button className="button ghost" disabled={busy} onClick={()=>void copyPrompt()}>Copy prompt only</button></div>
    {detail?<div className="du-job-detail"><dl className="detail-grid"><div><dt>Client</dt><dd>{job.client_name||'—'}</dd></div><div><dt>Phone</dt><dd>{job.phone||'—'}</dd></div><div><dt>Submitted</dt><dd>{new Date(job.created_at).toLocaleString()}</dd></div></dl>
      <div className="du-source-grid">{detail.photos.map((photo,index)=><a className="button ghost" key={photo.id} href={photo.signed_url||undefined} download={photo.original_filename||`source-${index+1}.jpg`} target="_blank" rel="noreferrer">Download source {index+1}</a>)}</div>
      <label>Workflow stage<select value={job.workflow_status} disabled={busy} onChange={event=>void setWorkflow(event.target.value as WorkflowStatus)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>:null}{message?<div className="notice">{message}</div>:null}
  </article>;
}

export function DuAdminPage(){
  const [session,setSession]=useState<Session|null>(null),[dashboard,setDashboard]=useState<Dashboard|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [pushBusy,setPushBusy]=useState(false),[pushEnabled,setPushEnabled]=useState(false),[pushMessage,setPushMessage]=useState('');
  const targetJob=useMemo(()=>new URLSearchParams(window.location.search).get('job')?.trim().toUpperCase()||null,[]);
  const pushSupported=useMemo(()=>typeof window!=='undefined'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window,[]);
  const load=useCallback(async(active:Session|null)=>{if(!active){setDashboard(null);setLoading(false);return;}setLoading(true);setError('');try{setDashboard(await callFunction<Dashboard>('du-admin',{action:'dashboard'},active.access_token));}catch(reason){setError(reason instanceof Error?reason.message:'Admin access failed.');}finally{setLoading(false);}},[]);
  useEffect(()=>ensureDuPwaMetadata(),[]);
  useEffect(()=>{
    const badgeNavigator=navigator as BadgeNavigator;
    badgeNavigator.clearAppBadge?.().catch(()=>undefined);
    if(!pushSupported)return;
    navigator.serviceWorker.getRegistration().then(async registration=>{
      const subscription=await registration?.pushManager.getSubscription();
      setPushEnabled(Boolean(subscription));
    }).catch(()=>undefined);
  },[pushSupported]);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);void load(data.session);});const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);void load(next);});return()=>data.subscription.unsubscribe();},[load]);
  const jobs=useMemo(()=>dashboard?.jobs.filter(job=>activeStates.includes(job.workflow_status))||[],[dashboard]);

  async function enablePush(){
    if(!session)return;
    setPushBusy(true);setPushMessage('');
    try{
      if(!pushSupported)throw new Error('This browser does not support Web Push.');
      if(isIos()&&!isStandalone())throw new Error('On iPhone, open this D&U admin page in Safari, tap Share → Add to Home Screen, reopen D&U from the Home Screen icon, then tap Enable notifications.');
      if(Notification.permission==='denied')throw new Error('Notifications are blocked. On iPhone, open Settings → Notifications → D&U and allow notifications.');
      const config=await callFunction<PushConfig>('du-admin',{action:'push_config'},session.access_token);
      const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(permission!=='granted')throw new Error('Notification permission was not granted.');
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(config.public_key) as BufferSource});}
      const serialized=subscription.toJSON();
      if(!serialized.keys?.p256dh||!serialized.keys.auth)throw new Error('The browser did not provide a complete push subscription.');
      await callFunction('du-admin',{action:'push_subscribe',subscription:{endpoint:subscription.endpoint,keys:{p256dh:serialized.keys.p256dh,auth:serialized.keys.auth}},user_agent:navigator.userAgent},session.access_token);
      setPushEnabled(true);
      const test=await callFunction<PushTest>('du-admin',{action:'push_test'},session.access_token);
      setPushMessage(test.sent>0?'Notifications enabled. A test push was sent to this device.':'Notifications were enabled, but the test push did not report a successful delivery.');
    }catch(reason){setPushMessage(reason instanceof Error?reason.message:'Could not enable notifications.');}
    finally{setPushBusy(false);}
  }

  async function testPush(){
    if(!session)return;
    setPushBusy(true);setPushMessage('');
    try{const result=await callFunction<PushTest>('du-admin',{action:'push_test'},session.access_token);setPushMessage(result.sent>0?`Test push sent to ${result.sent} device${result.sent===1?'':'s'}.`:'No active push subscription received the test.');}
    catch(reason){setPushMessage(reason instanceof Error?reason.message:'Could not send the test push.');}
    finally{setPushBusy(false);}
  }

  if(!session)return <Shell admin><main className="content narrow"><Login targetJob={targetJob}/></main></Shell>;
  return <Shell admin><main className="content"><div className="admin-dashboard"><div className="admin-topbar"><div><span className="eyebrow">Dyed &amp; Unattached</span><h1>Production queue</h1><p>{dashboard?.admin.display_name||dashboard?.admin.role||'Authorized admin'}</p></div><div className="admin-metrics"><div><strong>{jobs.length}</strong><span>active jobs</span></div><div><strong>{jobs.reduce((sum,job)=>sum+job.source_photo_count,0)}</strong><span>source photos</span></div></div></div>
    <div className="button-row"><button className={pushEnabled?'button ghost':'button primary'} disabled={pushBusy||!pushSupported} onClick={()=>void enablePush()}>{pushBusy?'Working…':pushEnabled?'Notifications on':'Enable notifications'}</button>{pushEnabled?<button className="button ghost" disabled={pushBusy} onClick={()=>void testPush()}>Send test push</button>:null}</div>
    {isIos()&&!isStandalone()&&!pushEnabled?<div className="notice"><strong>iPhone push setup</strong><span>Safari Share → Add to Home Screen → open D&amp;U from the new icon → Enable notifications.</span></div>:null}
    {pushMessage?<div className="notice">{pushMessage}</div>:null}
    {loading?<div className="empty-state">Loading production queue…</div>:error?<div className="notice error"><strong>Could not load queue.</strong><span>{error}</span></div>:jobs.length?<section className="admin-grid">{jobs.map(job=><JobCard key={job.id} job={job} session={session} refresh={()=>void load(session)} autoOpen={targetJob===job.job_number}/>)}</section>:<div className="empty-state"><strong>Production queue is clear.</strong><span>No stencil jobs currently require action.</span></div>}</div></main></Shell>;
}
