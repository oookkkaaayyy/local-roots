import { useEffect } from 'react';
import { callFunction, configReady, supabase } from './lib/supabase';
import { Shell } from './components/Shell';
import { EventsPage } from './pages/EventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { HbnfPage } from './pages/HbnfPage';
import { DyedUnattachedPage } from './pages/DyedUnattachedPage';
import { DuAdminPage } from './pages/DuAdminPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminPage } from './pages/AdminPage';
import { ReadinessPage } from './pages/ReadinessPage';

const PUBLIC_ORIGIN = 'https://localrootsdg.com';
type RouteMetadata = { title: string; description: string; canonical?: string; noindex?: boolean };
const routeMetadata: Record<string, RouteMetadata> = {
  '/': {title:'Local Roots · Southern California Disc Golf',description:'Local Roots connects Southern California disc golf events, HB Night Flyers and Dyed & Unattached.',canonical:'/'},
  '/events': {title:'SoCal Disc Golf Events · Local Roots',description:'Find current and upcoming disc golf events across Ventura, Los Angeles, Orange, Riverside, San Bernardino and San Diego counties.',canonical:'/events'},
  '/hb-night-flyers': {title:'HB Night Flyers · Local Roots',description:'HB Night Flyers community disc golf, weekly skins and glow events in Huntington Beach, California.',canonical:'/hb-night-flyers'},
  '/dyed-and-unattached': {title:'Dyed & Unattached · Local Roots',description:'Request a custom pet portrait disc stencil from Dyed & Unattached, a Local Roots sub-brand.',canonical:'/dyed-and-unattached'},
  '/admin': {title:'Local Roots Admin',description:'Local Roots administrative workspace.',canonical:'/admin',noindex:true},
  '/admin/events': {title:'Local Roots Event Admin',description:'Local Roots event administration.',canonical:'/admin/events',noindex:true},
  '/admin/readiness': {title:'Local Roots Launch Status',description:'Local Roots protected launch-readiness workspace.',canonical:'/admin/readiness',noindex:true},
  '/admin/dyed-and-unattached': {title:'D&U Production Queue · Local Roots',description:'Protected Dyed & Unattached production queue.',canonical:'/admin/dyed-and-unattached',noindex:true},
};
const notFoundMetadata: RouteMetadata={title:'Page not found · Local Roots',description:'The requested Local Roots page could not be found.',noindex:true};
function eventDetailSlug(path:string){if(!path.startsWith('/events/'))return null;const encoded=path.slice('/events/'.length);if(!encoded||encoded.includes('/'))return null;try{return decodeURIComponent(encoded);}catch{return null;}}
function useRouteMetadata(path:string){useEffect(()=>{const normalized=path==='/hbnf'?'/hb-night-flyers':path==='/du'?'/dyed-and-unattached':path;const eventDetail=eventDetailSlug(normalized)!=null;const metadata=routeMetadata[normalized]??(eventDetail?{title:'Disc Golf Event · Local Roots',description:'View Local Roots event details, registration information and authorized results.',canonical:normalized}:notFoundMetadata);document.title=metadata.title;let description=document.querySelector<HTMLMetaElement>('meta[name="description"]');if(!description){description=document.createElement('meta');description.name='description';document.head.appendChild(description);}description.content=metadata.description;let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(metadata.canonical){if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}canonical.href=`${PUBLIC_ORIGIN}${metadata.canonical}`;}else canonical?.remove();let robots=document.querySelector<HTMLMetaElement>('meta[name="robots"]');if(metadata.noindex){if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots);}robots.content='noindex,nofollow,noarchive';}else robots?.remove();},[path]);}
function ConfigMissing(){return <Shell><main className="content narrow"><div className="notice error"><strong>Local Roots configuration could not initialize.</strong><span>The public Supabase connection is unavailable. No private credentials should be entered here.</span></div></main></Shell>;}

type DuAdminAuth=string|{deviceToken:string};
type DuJobSummary={id:string;job_number:string;subject_name:string|null;notes:string|null};
type DuPhoto={id:string;original_filename:string|null;sort_order:number;signed_url:string|null};
type DuJobDetail={job:DuJobSummary;photos:DuPhoto[]};
type DuDashboard={jobs:DuJobSummary[]};
type DuPreparedJob={jobId:string;jobNumber:string;prompt:string;files:File[]};

const DU_DEVICE_TOKEN_KEY='du-admin-device-token-v1';
const duPreparedJobs=new Map<string,DuPreparedJob>();
const duPreparingJobs=new Map<string,Promise<DuPreparedJob>>();

async function duAdminAuth():Promise<DuAdminAuth>{
  const deviceToken=localStorage.getItem(DU_DEVICE_TOKEN_KEY);
  if(deviceToken)return {deviceToken};
  const {data}=await supabase.auth.getSession();
  if(data.session?.access_token)return data.session.access_token;
  throw new Error('D&U admin authorization is unavailable.');
}
function duFunctionAuth(auth:DuAdminAuth){return typeof auth==='string'?auth:{deviceToken:auth.deviceToken};}

function duCleanRoomPrompt(detail:DuJobDetail){
  const job=detail.job;
  const imageWord=detail.photos.length===1?'image':'images';
  return `START D&U STENCIL — ${job.job_number} — CLEAN ROOM v1

ISOLATION GATE
The ${detail.photos.length} source ${imageWord} attached to THIS USER MESSAGE are the only visual inputs allowed for this generation. Do not retrieve, inspect, or use images from earlier messages, other chats, memory, AKS, Drive, Library, prior candidates, or prior generated outputs as visual references. If these source images are not present as native image attachments in this message, STOP and reply exactly: CLEAN ROOM INPUT FAILURE. Do not generate.

SOURCE ROLES
Inspect every attached source image first. Choose exactly ONE source image as the composition authority for pose, crop, head angle, eye direction, expression, ear geometry, silhouette, and framing. If the submission notes explicitly designate a photo or composition, that instruction controls. Use every other source only to clarify the same pet's identity, markings, coat, and anatomy. Never average, merge, or substitute poses.

OUTPUT
Create ONE black-on-white stencil artwork only. Do not include the source photo, a comparison board, labels, options, mockups, a disc, background scenery, or a second candidate.

SUCCESS-DERIVED VISUAL TARGET
Preserve the specific pet's recognizable identity and meaningful asymmetry. Use clean decisive black masses, deliberate medium-scale white openings, natural cheeks/jaw/chin, and selective coat-direction detail rather than repetitive spikes. Preserve the eyes, muzzle/nose, head shape, ears, expression, and distinctive markings. Avoid generic breed-icon simplification, scratchboard texture, stippling or micro-speckle, tiny slivers, artificial eye rings/catchlights, arbitrary black blobs, and decorative detail that weakens likeness.

PRE-SHOW CHECK
Compare the rendered pixels directly against the chosen composition source before presenting it. Internally reject any result that materially changes the subject, pose, expression, key anatomy, or identity. Show only one serious artwork candidate. This step is artwork evaluation, not production-file certification.

Submission notes: ${job.notes||'None'}`;
}

async function duPrepareJob(job:DuJobSummary,auth:DuAdminAuth):Promise<DuPreparedJob>{
  const cached=duPreparedJobs.get(job.job_number);
  if(cached)return cached;
  const running=duPreparingJobs.get(job.job_number);
  if(running)return running;
  const promise=(async()=>{
    const detail=await callFunction<DuJobDetail>('du-admin',{action:'job',job_id:job.id},duFunctionAuth(auth));
    const files=await Promise.all(detail.photos.map(async(photo,index)=>{
      if(!photo.signed_url)throw new Error(`Source ${index+1} is unavailable.`);
      const response=await fetch(photo.signed_url);
      if(!response.ok)throw new Error(`Source ${index+1} could not be retrieved.`);
      const blob=await response.blob();
      const fallback=`${job.job_number}-source-${String(index+1).padStart(2,'0')}.jpg`;
      const rawName=(photo.original_filename||fallback).replace(/[^A-Za-z0-9._ -]+/g,'_');
      return new File([blob],`${job.job_number}-${String(index+1).padStart(2,'0')}-${rawName}`,{type:blob.type||'image/jpeg'});
    }));
    const prepared={jobId:job.id,jobNumber:job.job_number,prompt:duCleanRoomPrompt(detail),files};
    duPreparedJobs.set(job.job_number,prepared);
    duPreparingJobs.delete(job.job_number);
    return prepared;
  })().catch(error=>{duPreparingJobs.delete(job.job_number);throw error;});
  duPreparingJobs.set(job.job_number,promise);
  return promise;
}

async function duPrimeJobs(){
  const auth=await duAdminAuth();
  const dashboard=await callFunction<DuDashboard>('du-admin',{action:'dashboard'},duFunctionAuth(auth));
  await Promise.allSettled((dashboard.jobs||[]).map(job=>duPrepareJob(job,auth)));
}

function duSetCardStatus(card:HTMLElement,message:string,error=false){
  let notice=card.querySelector<HTMLElement>('.du-clean-room-status');
  if(!notice){
    notice=document.createElement('div');
    notice.className='notice du-clean-room-status';
    card.querySelector('.button-row')?.insertAdjacentElement('afterend',notice);
  }
  notice.classList.toggle('error',error);
  notice.textContent=message;
}

function duDownloadFiles(files:File[]){
  for(const file of files){
    const href=URL.createObjectURL(file);
    const anchor=document.createElement('a');
    anchor.href=href;anchor.download=file.name;document.body.appendChild(anchor);anchor.click();anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(href),30000);
  }
}

async function duHandleStart(card:HTMLElement,jobNumber:string){
  const prepared=duPreparedJobs.get(jobNumber);
  if(!prepared){
    duSetCardStatus(card,'Preparing isolated source attachments…');
    try{
      const auth=await duAdminAuth();
      const dashboard=await callFunction<DuDashboard>('du-admin',{action:'dashboard'},duFunctionAuth(auth));
      const job=(dashboard.jobs||[]).find(candidate=>candidate.job_number===jobNumber);
      if(!job)throw new Error('Job is not in the active D&U queue.');
      await duPrepareJob(job,auth);
      duSetCardStatus(card,'Clean-room files are ready. Tap Start Stencil again.');
    }catch(error){duSetCardStatus(card,error instanceof Error?error.message:'Could not prepare clean-room files.',true);}
    return;
  }
  try{
    let promptCopied=false;
    try{await navigator.clipboard.writeText(prepared.prompt);promptCopied=true;}catch{}
    duDownloadFiles(prepared.files);

    const auth=await duAdminAuth();
    await callFunction('du-admin',{action:'set_workflow',job_id:prepared.jobId,workflow_status:'stage_a_started',clear_handoff_error:true},duFunctionAuth(auth));

    duSetCardStatus(card,promptCopied
      ?`Downloaded ${prepared.files.length} isolated source image${prepared.files.length===1?'':'s'} and copied the clean-room prompt. Opening ChatGPT now. In the NEW chat, tap + → Add photos & files → Files, select the newest ${prepared.jobNumber}- files, paste if the prompt is not already filled, then Send.`
      :`Downloaded ${prepared.files.length} isolated source image${prepared.files.length===1?'':'s'}. Opening ChatGPT now. In the NEW chat, tap + → Add photos & files → Files, select the newest ${prepared.jobNumber}- files, then use Copy prompt only and Send.`);

    const deepLink=`com.openai.chat://chatgpt.com/?prompt=${encodeURIComponent(prepared.prompt)}`;
    window.setTimeout(()=>{window.location.href=deepLink;},250);
  }catch(error){
    duSetCardStatus(card,error instanceof Error?error.message:'Clean-room launch failed.',true);
  }
}
async function duHandleCopyPrompt(card:HTMLElement,jobNumber:string){
  const prepared=duPreparedJobs.get(jobNumber);
  if(!prepared){duSetCardStatus(card,'Clean-room files are still preparing. Tap again in a moment.');return;}
  try{
    await navigator.clipboard.writeText(prepared.prompt);
    duSetCardStatus(card,'Clean-room prompt copied. Use it only in a NEW chat with this job’s native source-image attachments.');
  }catch{duSetCardStatus(card,'Clipboard access was blocked.',true);}
}

function DuCleanRoomAdminPage(){
  useEffect(()=>{
    const prime=()=>void duPrimeJobs().catch(()=>undefined);
    prime();
    const {data:authListener}=supabase.auth.onAuthStateChange(()=>prime());
    window.addEventListener('focus',prime);
    const capture=(event:MouseEvent)=>{
      const target=event.target;
      if(!(target instanceof Element))return;
      const button=target.closest('button');
      const card=target.closest<HTMLElement>('.du-job-card');
      if(!button||!card)return;
      const label=(button.textContent||'').trim();
      if(label!=='Start Stencil'&&label!=='Copy prompt only')return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      const jobNumber=card.id.trim().toUpperCase();
      if(!jobNumber){duSetCardStatus(card,'Could not identify this D&U job.',true);return;}
      if(label==='Start Stencil')void duHandleStart(card,jobNumber);
      else void duHandleCopyPrompt(card,jobNumber);
    };
    document.addEventListener('click',capture,true);
    return()=>{document.removeEventListener('click',capture,true);window.removeEventListener('focus',prime);authListener.subscription.unsubscribe();};
  },[]);
  return <DuAdminPage/>;
}

export default function App(){const path=window.location.pathname.replace(/\/+$/,'')||'/';const detailSlug=eventDetailSlug(path);useRouteMetadata(path);if(!configReady)return <ConfigMissing/>;if(path==='/admin/dyed-and-unattached')return <DuCleanRoomAdminPage/>;if(path==='/admin/readiness')return <ReadinessPage/>;if(path==='/admin/events'||path==='/admin')return <AdminPage/>;if(detailSlug)return <EventDetailPage slug={detailSlug}/>;if(path==='/events')return <EventsPage/>;if(path==='/hb-night-flyers'||path==='/hbnf')return <HbnfPage/>;if(path==='/dyed-and-unattached'||path==='/du')return <DyedUnattachedPage/>;if(path==='/')return <EventsPage landing/>;return <NotFoundPage/>;}
