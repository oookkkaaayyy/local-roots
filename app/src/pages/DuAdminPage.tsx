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

const labels:Record<WorkflowStatus,string>={draft:'Draft',intake_complete:'Intake complete',handoff_preparing:'Preparing handoff',chatgpt_ready:'ChatGPT ready',notification_sent:'Notified',stage_a_started:'Stage A started',awaiting_art_approval:'Awaiting art approval',art_approved:'Art approved',production_ready:'Production ready',complete:'Complete',handoff_failed:'Handoff failed'};
const activeStates:WorkflowStatus[]=['intake_complete','handoff_preparing','chatgpt_ready','notification_sent','stage_a_started','awaiting_art_approval','art_approved','production_ready','handoff_failed'];

function Login(){
  const [email,setEmail]=useState(''),[message,setMessage]=useState(''),[sending,setSending]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setSending(true);const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:`${window.location.origin}/admin/dyed-and-unattached`}});setMessage(error?error.message:'Check your email for the secure sign-in link.');setSending(false);}
  return <div className="admin-login"><span className="eyebrow">Dyed &amp; Unattached operations</span><h1>Production queue</h1><p>Authorized reviewers only. Sign in with a magic link.</p><form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="button primary" disabled={sending}>{sending?'Sending…':'Send sign-in link'}</button></form>{message?<div className="notice">{message}</div>:null}</div>;
}

function stagePrompt(detail:JobDetail){
  const job=detail.job;
  const photoWord=detail.photos.length===1?'photo':'photos';
  return `MAKE A DISC-GOLF STENCIL — ${job.job_number}\n\nUse the ${detail.photos.length} attached source ${photoWord} as the only identity/anatomy reference for ${job.subject_name||'this subject'}.\n\nCreate one clean black-and-white stencil portrait directly from the source ${photoWord}. Preserve the exact subject's identity, natural proportions, expression, asymmetry, eyes, ears, muzzle/nose, head shape, and distinctive markings. Use a head-dominant composition on a plain white background with bold connected black shapes, medium-scale negative space, and moderate detail. Remove background, body, and collar unless essential to recognition. Avoid cartooning, generic breed-icon simplification, scratchboard texture, stippling, micro-speckle, tiny decorative marks, artificial borders, and geometry from any rejected prior candidate.\n\nSubmission notes: ${job.notes||'None'}\n\nDo not run legacy Stage-A admission, best-of-N, semantic-master, benchmark-conditioning, raw-normalization, or machine semantic-PASS workflows. Compare the result directly with the source before presenting it. If it plainly does not resemble the source, reject it rather than calling it passed. Show one serious artwork candidate only.`;
}

function JobCard({job,session,refresh}:{job:JobSummary;session:Session;refresh:()=>void}){
  const [detail,setDetail]=useState<JobDetail|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const load=useCallback(async()=>{setBusy(true);setMessage('');try{setDetail(await callFunction<JobDetail>('du-admin',{action:'job',job_id:job.id},session.access_token));}catch(error){setMessage(error instanceof Error?error.message:'Could not load job.');}finally{setBusy(false);}},[job.id,session.access_token]);
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
        setMessage('Sources shared and prompt copied. Choose ChatGPT from the share sheet; if the text is omitted, paste the copied prompt.');
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
    <div className="button-row"><button className="button ghost" disabled={busy} onClick={()=>detail?setDetail(null):void load()}>{busy?'Preparing…':detail?'Hide details':'Open job'}</button><button className="button primary" disabled={busy} onClick={()=>void prepareForChatGPT()}>Prepare for ChatGPT</button><button className="button ghost" disabled={busy} onClick={()=>void copyPrompt()}>Copy prompt only</button></div>
    {detail?<div className="du-job-detail"><dl className="detail-grid"><div><dt>Client</dt><dd>{job.client_name||'—'}</dd></div><div><dt>Phone</dt><dd>{job.phone||'—'}</dd></div><div><dt>Submitted</dt><dd>{new Date(job.created_at).toLocaleString()}</dd></div></dl>
      <div className="du-source-grid">{detail.photos.map((photo,index)=><a className="button ghost" key={photo.id} href={photo.signed_url||undefined} download={photo.original_filename||`source-${index+1}.jpg`} target="_blank" rel="noreferrer">Download source {index+1}</a>)}</div>
      <label>Workflow stage<select value={job.workflow_status} disabled={busy} onChange={event=>void setWorkflow(event.target.value as WorkflowStatus)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>:null}{message?<div className="notice">{message}</div>:null}
  </article>;
}

export function DuAdminPage(){
  const [session,setSession]=useState<Session|null>(null),[dashboard,setDashboard]=useState<Dashboard|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=useCallback(async(active:Session|null)=>{if(!active){setDashboard(null);setLoading(false);return;}setLoading(true);setError('');try{setDashboard(await callFunction<Dashboard>('du-admin',{action:'dashboard'},active.access_token));}catch(reason){setError(reason instanceof Error?reason.message:'Admin access failed.');}finally{setLoading(false);}},[]);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);void load(data.session);});const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);void load(next);});return()=>data.subscription.unsubscribe();},[load]);
  const jobs=useMemo(()=>dashboard?.jobs.filter(job=>activeStates.includes(job.workflow_status))||[],[dashboard]);
  if(!session)return <Shell admin><main className="content narrow"><Login/></main></Shell>;
  return <Shell admin><main className="content"><div className="admin-dashboard"><div className="admin-topbar"><div><span className="eyebrow">Dyed &amp; Unattached</span><h1>Production queue</h1><p>{dashboard?.admin.display_name||dashboard?.admin.role||'Authorized admin'}</p></div><div className="admin-metrics"><div><strong>{jobs.length}</strong><span>active jobs</span></div><div><strong>{jobs.reduce((sum,job)=>sum+job.source_photo_count,0)}</strong><span>source photos</span></div></div></div>
    {loading?<div className="empty-state">Loading production queue…</div>:error?<div className="notice error"><strong>Could not load queue.</strong><span>{error}</span></div>:jobs.length?<section className="admin-grid">{jobs.map(job=><JobCard key={job.id} job={job} session={session} refresh={()=>void load(session)}/>)}</section>:<div className="empty-state"><strong>Production queue is clear.</strong><span>No stencil jobs currently require action.</span></div>}</div></main></Shell>;
}
