type Env={AI:{run:(model:string,input:unknown)=>Promise<{image?:string}>}};
type ImageInput={photo_id:string;data_url:string};

const SUPABASE_URL='https://wtymjxscneufjlkkywyg.supabase.co';
const SUPABASE_KEY='sb_publishable_rimiZU1rSfq1nCEOUBw3ew_1j_GuZUx';
const MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const RECIPE='du-generation-v2-r1';

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
}
function decodeDataUrl(value:string){
  const match=value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw new Error('invalid_image');
  const raw=atob(match[2]);
  if(raw.length<100||raw.length>900000)throw new Error('invalid_image_size');
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  return {mime:match[1],bytes};
}
function forwardedAuth(request:Request){
  const headers:Record<string,string>={'content-type':'application/json',apikey:SUPABASE_KEY};
  const auth=request.headers.get('authorization');
  const device=request.headers.get('x-du-device-token');
  if(auth)headers.authorization=auth;
  if(device)headers['x-du-device-token']=device;
  return headers;
}
function stencilPrompt(subjectName:string,identityCount:number,revisionNote:string){
  const refs=identityCount
    ? `Images 1 through ${identityCount} are identity-only references for the SAME pet. Use them only to clarify markings, coat, facial structure, and identity; do not borrow their pose or framing.`
    : '';
  const revision=revisionNote?`\nREVISION NOTE\n${revisionNote}\nPreserve every successful feature not implicated by this note.`:'';
  return `Create ONE production-quality black-and-white pet portrait stencil of ${subjectName||'the pet'}.

IMAGE ROLES
Image 0 is the absolute composition authority. Preserve that exact pet, pose, crop, head angle, eye direction, expression, ear geometry, silhouette, proportions, and asymmetry. ${refs}

VISUAL TARGET
Transform the pet into a clean stencil illustration on a plain white background. Use coherent solid black masses and deliberate medium-scale white openings. Preserve recognizable eyes, muzzle and nose structure, cheeks, jaw, chin, ears, expression, and distinctive markings. Use selective coat-direction detail only where it improves likeness.

AVOID
No comparison board, labels, mockup, disc, scenery, body/background clutter, generic breed-icon simplification, cartooning, repetitive spiky fur, scratchboard texture, stippling, micro-speckle, tiny islands/slivers, fake eye rings or catchlights, arbitrary black blobs, or decorative detail that weakens likeness.

OUTPUT
One centered head-dominant stencil artwork only. Black and white only.${revision}`;
}

export const onRequestPost=async(context:{request:Request;env:Env})=>{
  try{
    const body=await context.request.json() as {
      job_id?:string;composition_photo_id?:string;images?:ImageInput[];
      seed?:number;revision_note?:string;
    };
    const jobId=String(body.job_id||'').trim();
    const compositionId=String(body.composition_photo_id||'').trim();
    const images=Array.isArray(body.images)?body.images:[];
    if(!jobId||!compositionId||images.length<1||images.length>4)return json({error:'invalid_request'},400);

    const authHeaders=forwardedAuth(context.request);
    const authResponse=await fetch(`${SUPABASE_URL}/functions/v1/du-admin`,{
      method:'POST',headers:authHeaders,body:JSON.stringify({action:'job',job_id:jobId}),
    });
    if(!authResponse.ok)return json({error:'unauthorized'},authResponse.status===401?401:403);
    const detail=await authResponse.json() as {job:{id:string;job_number:string;subject_name?:string};photos:Array<{id:string;sort_order:number}>};
    const allowed=new Set(detail.photos.map(photo=>photo.id));
    if(!allowed.has(compositionId)||images.some(image=>!allowed.has(image.photo_id)))return json({error:'source_mismatch'},400);

    const ordered=[
      images.find(image=>image.photo_id===compositionId),
      ...images.filter(image=>image.photo_id!==compositionId),
    ].filter(Boolean) as ImageInput[];
    if(!ordered.length||ordered[0].photo_id!==compositionId)return json({error:'composition_missing'},400);

    const form=new FormData();
    const revisionNote=String(body.revision_note||'').trim().slice(0,1200);
    const prompt=stencilPrompt(detail.job.subject_name||'the pet',Math.max(0,ordered.length-1),revisionNote);
    const seed=Number.isInteger(body.seed)?Number(body.seed):1;
    form.append('prompt',prompt);
    form.append('width','1024');
    form.append('height','1024');
    form.append('seed',String(Math.max(0,Math.min(2147483647,seed))));
    ordered.forEach((image,index)=>{
      const decoded=decodeDataUrl(image.data_url);
      form.append(`input_image_${index}`,new Blob([decoded.bytes],{type:decoded.mime}),`source-${index}.jpg`);
    });

    const formResponse=new Response(form);
    const aiResponse=await context.env.AI.run(MODEL,{
      multipart:{body:formResponse.body,contentType:formResponse.headers.get('content-type')},
    });
    if(!aiResponse?.image)return json({error:'generation_failed'},502);
    return json({
      ok:true,image:aiResponse.image,model:MODEL,recipe_version:RECIPE,seed,prompt,
      job_id:detail.job.id,job_number:detail.job.job_number,
      composition_photo_id:compositionId,source_photo_ids:ordered.map(image=>image.photo_id),
    });
  }catch(error){
    return json({error:error instanceof Error?error.message:'generation_failed'},500);
  }
};
