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
type PairCode = {code:string;expires_at:string};
type PairRedeem = {device_token:string;expires_at:string};
type DeviceRegister = {ok:boolean;device_token?:string;expires_at?:string;already_paired?:boolean};
type AdminCredential = {kind:'session'|'device';value:string};
type HandoffCreate = {job_number:string;handoff_url:string;expires_at:string;source_photo_count:number};
type GalleryAdminItem = {id:string;is_published:boolean;caption:string|null;source_photo_path:string|null;stencil_path:string|null;finished_disc_path:string|null;sort_order:number;created_at:string;updated_at:string};
type GalleryList = {items:GalleryAdminItem[]};
type GalleryUpload = {ok:boolean;item:GalleryAdminItem};
type BadgeNavigator = Navigator & {
  standalone?: boolean;
  setAppBadge?: (contents?:number)=>Promise<void>;
  clearAppBadge?: ()=>Promise<void>;
};

const labels:Record<WorkflowStatus,string>={draft:'Draft',intake_complete:'Intake complete',handoff_preparing:'Preparing handoff',chatgpt_ready:'ChatGPT ready',notification_sent:'Notified',stage_a_started:'Stage A started',awaiting_art_approval:'Awaiting art approval',art_approved:'Art approved',production_ready:'Production ready',complete:'Complete',handoff_failed:'Handoff failed'};
const activeStates:WorkflowStatus[]=['intake_complete','handoff_preparing','chatgpt_ready','notification_sent','stage_a_started','awaiting_art_approval','art_approved','production_ready','handoff_failed'];
const DU_DEVICE_TOKEN_KEY='du-admin-device-token-v1';
function functionAuth(credential:AdminCredential){return credential.kind==='device'?{deviceToken:credential.value}:credential.value;}

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

function Login({targetJob,onPaired}:{targetJob:string|null;onPaired:(token:string)=>void}){
  const [email,setEmail]=useState(''),[pairCode,setPairCode]=useState(''),[message,setMessage]=useState(''),[sending,setSending]=useState(false),[pairing,setPairing]=useState(false);
  async function submit(event:FormEvent){
    event.preventDefault();setSending(true);setMessage('');
    if(targetJob)sessionStorage.setItem('du-target-job',targetJob);
    const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:`${window.location.origin}/admin/dyed-and-unattached`}});
    setMessage(error?error.message:'Check your email once. After this device is authorized, D&U will remember it across future builds.');setSending(false);
  }
  async function redeemPair(event:FormEvent){
    event.preventDefault();setPairing(true);setMessage('');
    try{
      if(targetJob)sessionStorage.setItem('du-target-job',targetJob);
      const redeemed=await callFunction<PairRedeem>('du-pair',{code:pairCode});
      localStorage.setItem(DU_DEVICE_TOKEN_KEY,redeemed.device_token);
      onPaired(redeemed.device_token);
      setMessage('Paired. This device will stay authorized across site builds.');
    }catch(reason){setMessage(reason instanceof Error?reason.message:'Could not pair this device.');}
    finally{setPairing(false);}
  }
  return <div className="admin-login"><span className="eyebrow">Dyed &amp; Unattached operations</span><h1>Production queue</h1>
    <p>This device is not paired yet. Enter a code from any already-authorized D&amp;U device. Once paired, normal site builds will not make you sign in again.</p>
    <form onSubmit={redeemPair}><label>Pairing code<input type="text" required autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" placeholder="XXXXX-XXXXX" value={pairCode} onChange={e=>setPairCode(e.target.value.toUpperCase())}/></label><button className="button primary" disabled={pairing}>{pairing?'Pairing…':'Pair this device'}</button></form>
    <details style={{marginTop:'22px'}}><summary style={{cursor:'pointer',fontWeight:800}}>One-time recovery sign-in</summary><p>Use email only if you have no authorized D&amp;U device left. A successful recovery automatically converts this browser into a persistent paired device.</p><form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="button ghost" disabled={sending}>{sending?'Sending…':'Send recovery link'}</button></form></details>
    {message?<div className="notice">{message}</div>:null}</div>;
}

function stagePrompt(detail:JobDetail){
  const job=detail.job;
  const photoWord=detail.photos.length===1?'photo':'photos';
  return `MAKE A DISC-GOLF STENCIL — ${job.job_number}\n\nUse the ${detail.photos.length} attached source ${photoWord} as the only identity/anatomy reference for ${job.subject_name||'this subject'}.\n\nCreate one clean black-and-white stencil portrait directly from the source ${photoWord}. Preserve the exact subject's identity, natural proportions, expression, asymmetry, eyes, ears, muzzle/nose, head shape, and distinctive markings. Use a head-dominant composition on a plain white background with bold connected black shapes, medium-scale negative space, and moderate detail. Remove background, body, and collar unless essential to recognition. Avoid cartooning, generic breed-icon simplification, scratchboard texture, stippling, micro-speckle, tiny decorative marks, artificial borders, and geometry from any rejected prior candidate.\n\nSubmission notes: ${job.notes||'None'}\n\nDo not run legacy Stage-A admission, best-of-N, semantic-master, benchmark-conditioning, raw-normalization, or machine semantic-PASS workflows. Compare the result directly with the source before presenting it. If it plainly does not resemble the source, reject it rather than calling it passed. Show one serious artwork candidate only.`;
}

function JobCard({job,credential,refresh,autoOpen}:{job:JobSummary;credential:AdminCredential;refresh:()=>void;autoOpen:boolean}){
  const [detail,setDetail]=useState<JobDetail|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [handoffText,setHandoffText]=useState(''),[handoffExpires,setHandoffExpires]=useState('');
  const load=useCallback(async()=>{setBusy(true);setMessage('');try{setDetail(await callFunction<JobDetail>('du-admin',{action:'job',job_id:job.id},functionAuth(credential)));}catch(error){setMessage(error instanceof Error?error.message:'Could not load job.');}finally{setBusy(false);}},[job.id,credential.kind,credential.value]);
  useEffect(()=>{if(!autoOpen)return;void load();const timer=window.setTimeout(()=>document.getElementById(job.job_number)?.scrollIntoView({behavior:'smooth',block:'start'}),100);return()=>window.clearTimeout(timer);},[autoOpen,job.job_number,load]);
  async function setWorkflow(workflow_status:WorkflowStatus){setBusy(true);setMessage('');try{await callFunction('du-admin',{action:'set_workflow',job_id:job.id,workflow_status,clear_handoff_error:true},functionAuth(credential));setMessage(`Moved to ${labels[workflow_status]}.`);refresh();}catch(error){setMessage(error instanceof Error?error.message:'Update failed.');}finally{setBusy(false);}}
  async function copyPrompt(){if(!detail)await load();const current=detail??await callFunction<JobDetail>('du-admin',{action:'job',job_id:job.id},functionAuth(credential));await navigator.clipboard.writeText(stagePrompt(current));setDetail(current);setMessage('ChatGPT prompt copied. Download the source photos below, attach them together, and paste.');}
  async function copyHandoff(){
    if(!handoffText)return;
    try{await navigator.clipboard.writeText(handoffText);setMessage('Secure handoff copied. Open ChatGPT, paste, and send.');}
    catch{setMessage('Clipboard access was blocked. Press and hold inside the handoff text below, copy it manually, then open ChatGPT.');}
  }
  function openChatGPT(){
    const opened=window.open('https://chatgpt.com/','_blank');
    if(!opened)window.location.assign('https://chatgpt.com/');
  }
  async function prepareForChatGPT(){
    setBusy(true);setMessage('');setHandoffText('');setHandoffExpires('');
    let chatWindow:Window|null=null;
    try{
      chatWindow=window.open('about:blank','du-chatgpt');
      const handoff=await callFunction<HandoffCreate>('du-handoff-create',{job_id:job.id},functionAuth(credential));
      const instruction=`START D&U STENCIL — ${handoff.job_number}\n\nSecure handoff ZIP (${handoff.source_photo_count} source photo${handoff.source_photo_count===1?'':'s'}; expires in 30 minutes):\n${handoff.handoff_url}\n\nDownload the ZIP yourself; do not ask me to upload the photos. Unpack it, read START_HERE.txt, inspect every source photo, use current Dyed & Unattached standards/AKS context if available, and begin stencil development.`;
      setHandoffText(instruction);setHandoffExpires(handoff.expires_at);
      let copied=false;
      try{await navigator.clipboard.writeText(instruction);copied=true;}catch{copied=false;}
      refresh();
      if(copied){
        setMessage('Secure handoff copied. Opening ChatGPT now — paste the instruction and send it.');
        if(chatWindow)chatWindow.location.href='https://chatgpt.com/';
        else openChatGPT();
      }else{
        chatWindow?.close();
        setMessage('Secure handoff is ready, but iPhone blocked automatic clipboard copy. Use Copy handoff below, then Open ChatGPT.');
      }
    }catch(error){chatWindow?.close();setMessage(error instanceof Error?error.message:'Could not prepare the secure ChatGPT handoff.');}
    finally{setBusy(false);}
  }
  return <article className="admin-card du-job-card" id={job.job_number}>
    <div className="admin-card-head"><div><h3>{job.job_number} · {job.subject_name||'Unnamed pet'}</h3><p>{job.client_name||'Unknown client'} · {new Date(job.created_at).toLocaleString()}</p></div><div className="pill-row"><span className={`health health-${job.workflow_status==='handoff_failed'?'critical':job.workflow_status==='complete'?'healthy':'warning'}`}>{labels[job.workflow_status]}</span><span className="status-pill">{job.source_photo_count} photo{job.source_photo_count===1?'':'s'}</span></div></div>
    {job.notes?<p className="admin-notes">{job.notes}</p>:null}
    {job.handoff_last_error?<div className="notice error"><strong>Handoff error</strong><span>{job.handoff_last_error}</span></div>:null}
    <div className="button-row"><button className="button ghost" disabled={busy} onClick={()=>detail?setDetail(null):void load()}>{busy?'Preparing…':detail?'Hide details':'Open job'}</button><button className="button primary" disabled={busy} onClick={()=>void prepareForChatGPT()}>Start Stencil</button><button className="button ghost" disabled={busy} onClick={()=>void copyPrompt()}>Copy prompt only</button></div>
    {handoffText?<div className="notice"><strong>Secure ChatGPT handoff ready</strong><span>{handoffExpires?`Expires ${new Date(handoffExpires).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}.`:''} ChatGPT can retrieve the source package directly; you do not need to attach the photos.</span><textarea readOnly value={handoffText} rows={7} style={{width:'100%',minHeight:'10rem'}} onFocus={event=>event.currentTarget.select()}/><div className="button-row"><button className="button primary" type="button" onClick={()=>void copyHandoff()}>Copy handoff</button><button className="button ghost" type="button" onClick={openChatGPT}>Open ChatGPT</button></div></div>:null}
    {detail?<div className="du-job-detail"><dl className="detail-grid"><div><dt>Client</dt><dd>{job.client_name||'—'}</dd></div><div><dt>Phone</dt><dd>{job.phone||'—'}</dd></div><div><dt>Submitted</dt><dd>{new Date(job.created_at).toLocaleString()}</dd></div></dl>
      <div className="du-source-grid">{detail.photos.map((photo,index)=><a className="button ghost" key={photo.id} href={photo.signed_url||undefined} download={photo.original_filename||`source-${index+1}.jpg`} target="_blank" rel="noreferrer">Download source {index+1}</a>)}</div>
      <label>Workflow stage<select value={job.workflow_status} disabled={busy} onChange={event=>void setWorkflow(event.target.value as WorkflowStatus)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>:null}{message?<div className="notice">{message}</div>:null}
  </article>;
}

function prepareGalleryImage(file:File,role:'source_photo'|'stencil'|'finished_disc',maxSide=1800):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Could not read that image.'));
    reader.onload=()=>{
      if(typeof reader.result!=='string')return reject(new Error('Could not read that image.'));
      const image=new Image();
      image.onerror=()=>reject(new Error('Could not decode that image.'));
      image.onload=()=>{
        const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const context=canvas.getContext('2d');
        if(!context)return reject(new Error('Could not prepare that image.'));
        if(role!=='stencil'){context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);}
        context.drawImage(image,0,0,canvas.width,canvas.height);
        resolve(role==='stencil'?canvas.toDataURL('image/png'):canvas.toDataURL('image/jpeg',.88));
      };
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function GalleryPanel({credential}:{credential:AdminCredential}){
  const [items,setItems]=useState<GalleryAdminItem[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [publishNow,setPublishNow]=useState(false);
  const load=useCallback(async()=>{try{const result=await callFunction<GalleryList>('du-admin',{action:'gallery_list'},functionAuth(credential));setItems(result.items||[]);}catch{/* queue remains usable if gallery read fails */}},[credential.kind,credential.value]);
  useEffect(()=>{void load();},[load]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('Preparing images…');
    const form=event.currentTarget;const data=new FormData(form);
    try{
      const source=(form.elements.namedItem('gallerySource') as HTMLInputElement|null)?.files?.[0]||null;
      const stencil=(form.elements.namedItem('galleryStencil') as HTMLInputElement|null)?.files?.[0]||null;
      const finished=(form.elements.namedItem('galleryFinished') as HTMLInputElement|null)?.files?.[0]||null;
      const selected=[source,stencil,finished].filter(Boolean);
      if(selected.length<2)throw new Error('Choose at least two images. Preferred: reference photo + finished disc.');
      const images:Record<string,string>={};
      if(source)images.source_photo=await prepareGalleryImage(source,'source_photo');
      if(stencil)images.stencil=await prepareGalleryImage(stencil,'stencil');
      if(finished)images.finished_disc=await prepareGalleryImage(finished,'finished_disc');
      setMessage('Uploading…');
      await callFunction<GalleryUpload>('du-admin',{action:'gallery_upload',caption:String(data.get('galleryCaption')||'').trim(),is_published:publishNow,images},functionAuth(credential));
      form.reset();setPublishNow(false);await load();
      setMessage(publishNow?'Published to the public gallery.':'Saved to the gallery inbox. Tell ChatGPT “publish newest gallery item” when you want me to do the final check and publish it.');
    }catch(reason){setMessage(reason instanceof Error?reason.message:'Gallery upload failed.');}
    finally{setBusy(false);}
  }
  async function setPublished(item:GalleryAdminItem,is_published:boolean){
    setBusy(true);setMessage('');
    try{await callFunction('du-admin',{action:'gallery_set_published',item_id:item.id,is_published},functionAuth(credential));await load();setMessage(is_published?'Published.':'Hidden from the public gallery.');}
    catch(reason){setMessage(reason instanceof Error?reason.message:'Gallery update failed.');}
    finally{setBusy(false);}
  }
  return <section className="admin-card" style={{marginTop:'18px'}} aria-labelledby="du-gallery-inbox-title">
    <div className="admin-card-head"><div><span className="eyebrow">Portfolio</span><h3 id="du-gallery-inbox-title">Gallery inbox</h3><p>Add new work from your phone without rebuilding the site. Preferred public pair: reference photo + finished disc.</p></div><span className="status-pill">{items.filter(item=>!item.is_published).length} draft</span></div>
    <form onSubmit={submit} style={{display:'grid',gap:'12px',marginTop:'16px'}}>
      <div className="du-form-grid">
        <label>Reference photo<input name="gallerySource" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        <label>Finished disc<input name="galleryFinished" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        <label className="span-2">Stencil artwork <span className="optional">optional when finished disc is included</span><input name="galleryStencil" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        <label className="span-2">Caption <span className="optional">optional</span><input name="galleryCaption" maxLength={300} placeholder="Pet name or a short note" /></label>
      </div>
      <label className="checkbox"><input type="checkbox" checked={publishNow} onChange={event=>setPublishNow(event.target.checked)}/> Publish immediately</label>
      <div className="button-row"><button className="button primary" type="submit" disabled={busy}>{busy?'Working…':'Add to gallery inbox'}</button></div>
    </form>
    {message?<div className="notice">{message}</div>:null}
    {items.length?<div style={{display:'grid',gap:'8px',marginTop:'14px'}}>{items.slice(0,8).map(item=><div key={item.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',padding:'10px 12px',border:'1px solid var(--line)',borderRadius:'12px'}}><div><strong>{item.caption||'Untitled gallery item'}</strong><div className="small-note">{item.is_published?'Published':'Draft'} · {new Date(item.created_at).toLocaleDateString()}</div></div><button className="button ghost" type="button" disabled={busy} onClick={()=>void setPublished(item,!item.is_published)}>{item.is_published?'Hide':'Publish'}</button></div>)}</div>:null}
  </section>;
}

export function DuAdminPage(){
  const [session,setSession]=useState<Session|null>(null),[deviceToken,setDeviceToken]=useState<string|null>(()=>localStorage.getItem(DU_DEVICE_TOKEN_KEY));
  const [dashboard,setDashboard]=useState<Dashboard|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [pushBusy,setPushBusy]=useState(false),[pushEnabled,setPushEnabled]=useState(false),[pushMessage,setPushMessage]=useState('');
  const [pairBusy,setPairBusy]=useState(false),[pairCode,setPairCode]=useState(''),[pairMessage,setPairMessage]=useState('');
  const targetJob=useMemo(()=>{
    const queryJob=new URLSearchParams(window.location.search).get('job')?.trim().toUpperCase()||null;
    if(queryJob){sessionStorage.setItem('du-target-job',queryJob);return queryJob;}
    return sessionStorage.getItem('du-target-job')?.trim().toUpperCase()||null;
  },[]);
  const pushSupported=useMemo(()=>typeof window!=='undefined'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window,[]);
  const credential=useMemo<AdminCredential|null>(()=>deviceToken?{kind:'device',value:deviceToken}:session?{kind:'session',value:session.access_token}:null,[deviceToken,session]);
  const load=useCallback(async(active:AdminCredential|null)=>{
    if(!active){setDashboard(null);setLoading(false);return;}
    setLoading(true);setError('');
    try{setDashboard(await callFunction<Dashboard>('du-admin',{action:'dashboard'},functionAuth(active)));}
    catch(reason){
      if(active.kind==='device'){
        localStorage.removeItem(DU_DEVICE_TOKEN_KEY);setDeviceToken(null);
        setError('This device authorization is no longer valid. Pair it once from another authorized D&U device.');
      }else setError(reason instanceof Error?reason.message:'Admin access failed.');
    }finally{setLoading(false);}
  },[]);

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
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe();},[]);
  useEffect(()=>{void load(credential);},[credential?.kind,credential?.value,load]);
  useEffect(()=>{
    if(!session||deviceToken)return;
    let cancelled=false;
    callFunction<DeviceRegister>('du-admin',{action:'device_register',label:isStandalone()?'D&U Home Screen':'D&U browser',user_agent:navigator.userAgent},session.access_token)
      .then(result=>{
        if(cancelled||!result.device_token)return;
        localStorage.setItem(DU_DEVICE_TOKEN_KEY,result.device_token);
        setDeviceToken(result.device_token);
      }).catch(()=>undefined);
    return()=>{cancelled=true;};
  },[session,deviceToken]);
  useEffect(()=>{if(!credential||!targetJob)return;const timer=window.setTimeout(()=>sessionStorage.removeItem('du-target-job'),2000);return()=>window.clearTimeout(timer);},[credential,targetJob]);
  const jobs=useMemo(()=>dashboard?.jobs.filter(job=>activeStates.includes(job.workflow_status))||[],[dashboard]);

  async function createPair(){
    if(!credential)return;
    setPairBusy(true);setPairMessage('');
    try{
      const result=await callFunction<PairCode>('du-admin',{action:'pair_create'},functionAuth(credential));
      setPairCode(result.code);
      try{await navigator.clipboard.writeText(result.code);setPairMessage('Pairing code copied. Open D&U on the new device and paste it there within 5 minutes.');}
      catch{setPairMessage('Pairing code created. Type the visible code into D&U on the new device within 5 minutes.');}
    }catch(reason){setPairMessage(reason instanceof Error?reason.message:'Could not create pairing code.');}
    finally{setPairBusy(false);}
  }

  async function copyPairCode(){
    if(!pairCode)return;
    try{await navigator.clipboard.writeText(pairCode);setPairMessage('Pairing code copied. Open D&U on the new device and paste it there within 5 minutes.');}
    catch{setPairMessage('Clipboard access was blocked. Press and hold the visible code, copy it, then paste it into D&U on the new device.');}
  }

  async function enablePush(){
    if(!credential)return;
    setPushBusy(true);setPushMessage('');
    try{
      if(!pushSupported)throw new Error('This browser does not support Web Push.');
      if(isIos()&&!isStandalone())throw new Error('On iPhone, open this D&U admin page in Safari, tap Share → Add to Home Screen, reopen D&U from the Home Screen icon, then tap Enable notifications.');
      if(Notification.permission==='denied')throw new Error('Notifications are blocked. On iPhone, open Settings → Notifications → D&U and allow notifications.');
      const config=await callFunction<PushConfig>('du-admin',{action:'push_config'},functionAuth(credential));
      const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(permission!=='granted')throw new Error('Notification permission was not granted.');
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(config.public_key) as BufferSource});}
      const serialized=subscription.toJSON();
      if(!serialized.keys?.p256dh||!serialized.keys.auth)throw new Error('The browser did not provide a complete push subscription.');
      await callFunction('du-admin',{action:'push_subscribe',subscription:{endpoint:subscription.endpoint,keys:{p256dh:serialized.keys.p256dh,auth:serialized.keys.auth}},user_agent:navigator.userAgent},functionAuth(credential));
      setPushEnabled(true);
      const test=await callFunction<PushTest>('du-admin',{action:'push_test'},functionAuth(credential));
      setPushMessage(test.sent>0?'Notifications enabled. A test push was sent to this device.':'Notifications were enabled, but the test push did not report a successful delivery.');
    }catch(reason){setPushMessage(reason instanceof Error?reason.message:'Could not enable notifications.');}
    finally{setPushBusy(false);}
  }

  async function testPush(){
    if(!credential)return;
    setPushBusy(true);setPushMessage('');
    try{const result=await callFunction<PushTest>('du-admin',{action:'push_test'},functionAuth(credential));setPushMessage(result.sent>0?`Test push sent to ${result.sent} device${result.sent===1?'':'s'}.`:'No active push subscription received the test.');}
    catch(reason){setPushMessage(reason instanceof Error?reason.message:'Could not send the test push.');}
    finally{setPushBusy(false);}
  }

  if(!credential)return <Shell admin><main className="content narrow"><Login targetJob={targetJob} onPaired={token=>setDeviceToken(token)}/></main></Shell>;
  return <Shell admin><main className="content"><div className="admin-dashboard"><div className="admin-topbar"><div><span className="eyebrow">Dyed &amp; Unattached</span><h1>Production queue</h1><p>{dashboard?.admin.display_name||dashboard?.admin.role||'Authorized admin'}</p></div><div className="admin-metrics"><div><strong>{jobs.length}</strong><span>active jobs</span></div><div><strong>{jobs.reduce((sum,job)=>sum+job.source_photo_count,0)}</strong><span>source photos</span></div></div></div>
    <div className="button-row"><button className="button ghost" disabled={pairBusy} onClick={()=>void createPair()}>{pairBusy?'Creating…':'Pair another device'}</button><button className={pushEnabled?'button ghost':'button primary'} disabled={pushBusy||!pushSupported} onClick={()=>void enablePush()}>{pushBusy?'Working…':pushEnabled?'Notifications on':'Enable notifications'}</button>{pushEnabled?<button className="button ghost" disabled={pushBusy} onClick={()=>void testPush()}>Send test push</button>:null}</div>
    {pairCode?<div className="notice"><strong>{pairCode}</strong><span>{pairMessage||'Paste this single-use code into D&U on the new device. It expires after 5 minutes.'}</span><button className="button ghost" type="button" onClick={()=>void copyPairCode()}>Copy code</button></div>:pairMessage?<div className="notice">{pairMessage}</div>:null}
    {deviceToken?<div className="notice"><strong>This device is paired.</strong><span>D&amp;U will remember it across normal site builds. Its authorization renews automatically while you keep using it.</span></div>:null}
    {pushMessage?<div className="notice">{pushMessage}</div>:null}
    <GalleryPanel credential={credential}/>
    {loading?<div className="empty-state">Loading production queue…</div>:error?<div className="notice error"><strong>Could not load queue.</strong><span>{error}</span></div>:jobs.length?<section className="admin-grid">{jobs.map(job=><JobCard key={job.id} job={job} credential={credential} refresh={()=>void load(credential)} autoOpen={targetJob===job.job_number}/>)}</section>:<div className="empty-state"><strong>Production queue is clear.</strong><span>No stencil jobs currently require action.</span></div>}</div></main></Shell>;
}
