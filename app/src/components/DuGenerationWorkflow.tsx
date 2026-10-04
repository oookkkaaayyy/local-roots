import { useEffect, useState } from 'react';
import { callFunction } from '../lib/supabase';

type Credential = {kind:'session'|'device';value:string};
type SourcePhoto = {id:string;original_filename:string|null;sort_order:number;signed_url:string|null};
type WorkflowState = {
  package: any|null; attempts: any[]; selection: any|null; correction: any|null;
  final_master: any|null; production_run: any|null;
};
const emptyState:WorkflowState={package:null,attempts:[],selection:null,correction:null,final_master:null,production_run:null};
const authFor=(credential:Credential)=>credential.kind==='device'?{deviceToken:credential.value}:credential.value;

function readFile(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Could not read the selected file.'));
    reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function imageExtension(mime:string){return mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':mime==='image/png'?'png':'img';}

async function downloadPrivate(url:string,name:string){
  const response=await fetch(url);
  if(!response.ok)throw new Error('Private file download failed. Refresh the package and try again.');
  const objectUrl=URL.createObjectURL(await response.blob());
  const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}

async function copyText(text:string){
  try{await navigator.clipboard.writeText(text);return 'Prompt copied.';}
  catch{return 'Clipboard is unavailable. Select and copy the prompt shown below.';}
}

function isPassingValidatorReport(report:any){
  return report?.artwork_width_mm===190.5&&Array.isArray(report?.cases)&&report.cases.length>0&&
    report.cases.every((item:any)=>item?.physical_verdict==='PASS');
}

export function DuGenerationWorkflow({jobId,photos,credential}:{jobId:string;photos:SourcePhoto[];credential:Credential}){
  const [state,setState]=useState<WorkflowState>(emptyState),[compositionId,setCompositionId]=useState('');
  const [prompt,setPrompt]=useState(''),[correctionPrompt,setCorrectionPrompt]=useState(''),[outcomeNote,setOutcomeNote]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [candidateFile,setCandidateFile]=useState<File|null>(null),[correctionFile,setCorrectionFile]=useState<File|null>(null);
  const [productionFile,setProductionFile]=useState<File|null>(null),[validatorFile,setValidatorFile]=useState<File|null>(null);
  const [validatorPassed,setValidatorPassed]=useState(false),[validatorReport,setValidatorReport]=useState<any>(null);
  const invoke=async(action:string,data:Record<string,unknown>={})=>callFunction<WorkflowState>('du-admin',{action,job_id:jobId,...data},authFor(credential));
  const refresh=async()=>setState(await invoke('generation_state'));
  useEffect(()=>{setCompositionId(current=>current||photos[0]?.id||'');void refresh().catch(error=>setMessage(error instanceof Error?error.message:'Could not load generation state.'));},[jobId,photos.length]);

  async function run(task:()=>Promise<unknown>,success:string){
    setBusy(true);setMessage('Working…');
    try{await task();await refresh();setMessage(success);}
    catch(error){setMessage(error instanceof Error?error.message:'Generation workflow action failed.');}
    finally{setBusy(false);}
  }

  async function uploadCandidate(){
    if(!candidateFile)return;
    const active=state.attempts.find(item=>item.status==='ready');
    if(!active)return;
    await run(async()=>{const image=await readFile(candidateFile);await invoke('generation_upload_candidate',{attempt_id:active.id,image_data_url:image,original_filename:candidateFile.name});setCandidateFile(null);},'Candidate attached to this attempt.');
  }
  async function uploadCorrection(){
    if(!correctionFile)return;
    await run(async()=>{const image=await readFile(correctionFile);await invoke('generation_upload_correction',{image_data_url:image,original_filename:correctionFile.name});setCorrectionFile(null);},'Correction candidate attached. The selected visual master remains preserved.');
  }
  async function uploadProduction(){
    if(!productionFile||!validatorReport||!validatorPassed)return;
    await run(async()=>{const image=await readFile(productionFile);await invoke('generation_upload_production',{image_data_url:image,original_filename:productionFile.name,validator_passed:true,validator_report:validatorReport});setProductionFile(null);},'Productionized output and passing validator report recorded.');
  }
  async function chooseValidatorReport(file:File|null){
    setValidatorFile(file);setValidatorPassed(false);setValidatorReport(null);
    if(!file)return;
    try{const report=JSON.parse(await file.text());setValidatorReport(report);setValidatorPassed(isPassingValidatorReport(report));setMessage(isPassingValidatorReport(report)?'Validator report confirms PASS at 190.5 mm.':'Report does not show PASS for every case at 190.5 mm.');}
    catch{setMessage('Validator report is not valid JSON.');}
  }

  const active=state.attempts.find(item=>item.status==='ready');
  const selectedAttempt=state.attempts.find(item=>item.id===state.selection?.attempt_id);
  const promptText=state.package?.locked_prompt||'';
  return <section className="du-generation-workflow" aria-label="Generation attempts and review">
    <h4>Generation workflow</h4>
    {!state.package?<div className="du-generation-lock">
      <p>Choose the composition source, paste the established D&amp;U prompt, then lock the package. D&amp;U snapshots each original source image privately and reuses those exact files for every fresh attempt.</p>
      <label>Composition image<select value={compositionId} disabled={busy} onChange={event=>setCompositionId(event.target.value)}>{photos.map((photo,index)=><option key={photo.id} value={photo.id}>Source {index+1} · {photo.original_filename||'uploaded image'}</option>)}</select></label>
      <label>Generation prompt to lock<textarea value={prompt} onChange={event=>setPrompt(event.target.value)} rows={6} maxLength={11800} placeholder="Paste the established D&U generation prompt here. Source-role instructions will be added and the exact final prompt is locked across Attempts A, B, and C."/></label>
      <button className="button primary" type="button" disabled={busy||photos.length===0||prompt.trim().length<20} onClick={()=>void run(()=>invoke('generation_lock_package',{composition_photo_id:compositionId,locked_prompt:prompt}),'Immutable source package locked; Attempt A is ready.')}>Lock source package and prepare Attempt A</button>
    </div>:<>
      <div className="du-generation-package"><strong>Locked clean-room package</strong><span>Prompt SHA-256: {state.package.prompt_sha256}</span><span>Source manifest SHA-256: {state.package.source_manifest_sha256}</span>
        <p>For each attempt, start a brand-new ChatGPT conversation. Attach only these package images individually, then paste the locked prompt. Never attach a previous candidate.</p>
        <div className="du-generation-source-list">{state.package.source_manifest.sources.map((source:any)=><button className="button ghost" type="button" key={source.source_photo_id} disabled={busy||!source.signed_url} onClick={()=>void downloadPrivate(source.signed_url,source.filename).catch(error=>setMessage(error.message))}>{source.filename} · {source.role==='composition'?'composition':'identity reference'}</button>)}</div>
        <textarea readOnly value={promptText} rows={5} aria-label="Locked generation prompt"/>
        <button className="button ghost" type="button" onClick={()=>void copyText(promptText).then(setMessage)}>Copy locked prompt</button>
      </div>
      <div className="du-generation-attempts"><h5>Independent attempts</h5><div className="du-generation-candidates">
        {state.attempts.map((attempt:any)=><article className="du-generation-candidate" key={attempt.id}>
          <h6>Attempt {String.fromCharCode(64+attempt.attempt_number)} <span className="status-pill">{attempt.status}</span></h6>
          {attempt.candidate_url?<img src={attempt.candidate_url} alt={`Candidate from attempt ${attempt.attempt_number}`} loading="lazy"/>:<p>No candidate uploaded.</p>}
          {attempt.candidate_sha256?<small>SHA-256 {attempt.candidate_sha256}</small>:null}
          {attempt.failure_note?<p><strong>Outcome note:</strong> {attempt.failure_note}</p>:null}
          {attempt.status==='ready'?<><p>Use the original package above in a fresh chat, then attach that chat’s result here.</p><label className="button ghost">Attach candidate<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>setCandidateFile(event.target.files?.[0]||null)}/></label><button className="button primary" type="button" disabled={busy||!candidateFile} onClick={()=>void uploadCandidate()}>{candidateFile?'Upload '+candidateFile.name:'Choose generated candidate'}</button><label>Failure note if this attempt cannot produce a candidate<textarea value={outcomeNote} onChange={event=>setOutcomeNote(event.target.value)} rows={2} maxLength={1000} placeholder="Record a short, non-identifying reason."/></label><button className="button ghost" type="button" disabled={busy||outcomeNote.trim().length<5} onClick={()=>void run(async()=>{await invoke('generation_mark_attempt',{attempt_id:attempt.id,status:'failed',failure_note:outcomeNote.trim()});setOutcomeNote('');},'Attempt marked failed. Original package remains unchanged.')}>Mark attempt failed</button></>:null}
          {attempt.status==='candidate'?<><label>Rejection note if this candidate is not selected<textarea value={outcomeNote} onChange={event=>setOutcomeNote(event.target.value)} rows={2} maxLength={1000} placeholder="Record a short, non-identifying reason."/></label><div className="button-row"><button className="button primary" type="button" disabled={busy} onClick={()=>void run(()=>invoke('generation_select_attempt',{attempt_id:attempt.id}),'Candidate selected as immutable visual master.')}>Select visual master</button><button className="button ghost" type="button" disabled={busy||outcomeNote.trim().length<5} onClick={()=>void run(async()=>{await invoke('generation_mark_attempt',{attempt_id:attempt.id,status:'rejected',failure_note:outcomeNote.trim()});setOutcomeNote('');},'Candidate rejected; next fresh attempt is available.')}>Reject candidate</button></div></>:null}
          {attempt.status==='selected'?<strong>Selected immutable visual master</strong>:null}
        </article>)}
      </div>
      {state.attempts.length<3&&!state.selection&&state.attempts.length>0&&['failed','rejected'].includes(state.attempts[state.attempts.length-1]?.status)?<button className="button primary" type="button" disabled={busy} onClick={()=>void run(()=>invoke('generation_next_attempt'),'Next independent attempt is ready from the same locked package.')}>Prepare Attempt {String.fromCharCode(64+state.attempts.length+1)}</button>:null}
      {state.attempts.length>=3&&!state.selection?<p>All three independent attempts are used. Choose one candidate or stop this job for human review.</p>:null}</div>

      {state.selection&&!state.correction&&!state.final_master?<div className="du-generation-correction"><h5>Optional one-time localized correction</h5><p>The selected visual master remains immutable and is the only permitted correction input. No further refinement chain can be opened.</p>
        <label>Localized correction instruction<textarea value={correctionPrompt} onChange={event=>setCorrectionPrompt(event.target.value)} rows={3} maxLength={2000} placeholder="Describe one localized correction only."/></label>
        <button className="button ghost" type="button" disabled={busy||!selectedAttempt?.candidate_url} onClick={()=>selectedAttempt?.candidate_url&&void downloadPrivate(selectedAttempt.candidate_url,`selected-visual-master.${imageExtension(selectedAttempt.candidate_metadata?.mime)}`).catch(error=>setMessage(error.message))}>Download selected visual master for correction</button>
        <button className="button primary" type="button" disabled={busy||correctionPrompt.trim().length<20} onClick={()=>void run(()=>invoke('generation_start_correction',{correction_prompt:correctionPrompt}),'One correction branch locked. Download the master, use a fresh chat, and upload one result.')}>Lock one correction branch</button>
      </div>:null}
      {state.correction?<div className="du-generation-correction"><h5>Single correction branch</h5><p>Base SHA-256: {state.correction.base_candidate_sha256}</p><pre>{state.correction.correction_prompt}</pre><button className="button ghost" type="button" onClick={()=>void copyText(state.correction.correction_prompt).then(setMessage)}>Copy correction instruction</button>
        {!state.correction.corrected_path?<><button className="button ghost" type="button" disabled={busy||!selectedAttempt?.candidate_url} onClick={()=>selectedAttempt?.candidate_url&&void downloadPrivate(selectedAttempt.candidate_url,`selected-visual-master.${imageExtension(selectedAttempt.candidate_metadata?.mime)}`).catch(error=>setMessage(error.message))}>Download immutable base image</button><label className="button ghost">Attach one correction result<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>setCorrectionFile(event.target.files?.[0]||null)}/></label><button className="button primary" type="button" disabled={busy||!correctionFile} onClick={()=>void uploadCorrection()}>{correctionFile?'Upload correction':'Choose correction result'}</button></>:<><img className="du-generation-correction-preview" src={state.correction.corrected_url} alt="One-time correction candidate"/><div className="button-row"><button className="button primary" type="button" disabled={busy} onClick={()=>void run(()=>invoke('generation_finalize_master',{master_kind:'correction'}),'Corrected image locked as final visual master.')}>Use correction as final master</button><button className="button ghost" type="button" disabled={busy} onClick={()=>void run(()=>invoke('generation_finalize_master',{master_kind:'attempt'}),'Original selected image locked as final visual master.')}>Keep original selected master</button></div></>}
      </div>:null}
      {state.selection&&!state.final_master?<button className="button primary" type="button" disabled={busy} onClick={()=>void run(()=>invoke('generation_finalize_master',{master_kind:'attempt'}),'Selected visual master locked for productionization.')}>Lock selected image as final visual master</button>:null}
      {state.final_master?<div className="du-generation-production"><h5>Final visual master</h5><p>{state.final_master.master_kind} · SHA-256 {state.final_master.master_sha256}</p><button className="button ghost" type="button" onClick={()=>{const mime=state.final_master.master_kind==='correction'?state.correction?.corrected_metadata?.mime:selectedAttempt?.candidate_metadata?.mime;void downloadPrivate(state.final_master.signed_url,`final-visual-master.${imageExtension(mime)}`).catch(error=>setMessage(error.message));}}>Download final visual master</button>
        {!state.production_run?<><p>Run the existing generalized productionizer and unchanged physical validator locally at 190.5 mm. Then attach the productionized PNG and the exact validator JSON report.</p><label className="button ghost">Productionized PNG<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>setProductionFile(event.target.files?.[0]||null)}/></label><input type="file" accept="application/json,.json" aria-label="Passing validator report JSON" disabled={busy} onChange={event=>void chooseValidatorReport(event.target.files?.[0]||null)}/>{validatorFile?<small>{validatorFile.name} · {validatorPassed?'PASS at 190.5 mm':'does not pass'}</small>:null}<button className="button primary" type="button" disabled={busy||!productionFile||!validatorPassed} onClick={()=>void uploadProduction()}>Record productionized output and validator PASS</button></>:<><p>Physical validator: PASS · artwork width 190.5 mm</p><a href={state.production_run.output_url} target="_blank" rel="noreferrer">View private productionized output</a></>}
      </div>:null}
    </>}
    {message?<div className={message.toLowerCase().includes('failed')?'notice error':'notice'} role="status">{message}</div>:null}
  </section>;
}
