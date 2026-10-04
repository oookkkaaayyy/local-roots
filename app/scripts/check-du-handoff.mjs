import { readFileSync } from 'node:fs';

const admin=readFileSync(new URL('../src/pages/DuAdminPage.tsx',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../src/components/DuGenerationWorkflow.tsx',import.meta.url),'utf8');
const wrangler=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const serviceWorker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const backend=readFileSync(new URL('../../supabase/functions/du-admin/index.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../../supabase/migrations/20261004214908_add_du_generation_attempt_orchestration.sql',import.meta.url),'utf8');
const failures=[];
const requireText=(source,text,label)=>{if(!source.includes(text))failures.push('Missing '+label);};
const forbidText=(source,text,label)=>{if(source.includes(text))failures.push('Forbidden '+label);};

forbidText(admin,'du-handoff-create','legacy secure handoff');
forbidText(admin,'chatgpt://','ChatGPT deep link');
forbidText(admin,"fetch('/api/du-generate'",'in-app image generation call');
forbidText(backend,'save_generated_draft','legacy mutable generated-draft persistence');
forbidText(workflow,'Regenerate with note','iterative full-image refinement');
requireText(workflow,'generation_lock_package','immutable package creation');
requireText(workflow,'generation_next_attempt','independent attempt orchestration');
requireText(workflow,'generation_select_attempt','candidate selection');
requireText(workflow,'generation_start_correction','single correction branch');
requireText(workflow,'generation_upload_production','production evidence recording');
for(const action of ['generation_state','generation_lock_package','generation_next_attempt','generation_mark_attempt','generation_upload_candidate','generation_select_attempt','generation_start_correction','generation_upload_correction','generation_finalize_master','generation_upload_production'])requireText(backend,`action === "${action}"`,`${action} server action`);
requireText(backend,'source-packages/${packageId}','private source package snapshot');
requireText(backend,'sourceManifestSha256','source manifest fingerprint');
requireText(backend,'01-APPROVED-COMPOSITION','composition role identity');
requireText(backend,'same-subject identity references','identity role identity');
requireText(backend,'validator_report_must_pass_at_190_5mm_for_exact_uploaded_file','exact-file validator evidence');
requireText(backend,'final_visual_master_required_before_art_approval','approval stage gate');
requireText(backend,'passing_production_validation_required_before_production','production stage gate');
requireText(migration,'attempt_number between 1 and 3','three-attempt cap');
requireText(migration,'attempt candidate is immutable','immutable candidate evidence');
requireText(migration,'correction candidate can be uploaded once','single correction upload');
requireText(migration,'enable row level security','private orchestration tables');
forbidText(wrangler,'"binding": "AI"','Workers AI binding');
requireText(serviceWorker,'notificationTarget(payload.url)','exact-job push target');
requireText(serviceWorker,'client.navigate(targetUrl)','push navigation');

if(failures.length){
  console.error('D&U Generation v2 regression check failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('D&U Generation v2 workflow contract check passed.');
