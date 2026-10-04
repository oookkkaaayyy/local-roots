export const DU_INTERIM_PROMPT_VERSION='clean-room-v1.1';

type DuPromptPhoto={id:string;original_filename:string|null;sort_order:number;signed_url:string|null};
type DuPromptDetail={
  job:{job_number:string;notes:string|null};
  photos:DuPromptPhoto[];
};

export function buildDuInterimCleanRoomPrompt(detail:DuPromptDetail){
  const job=detail.job;
  const imageWord=detail.photos.length===1?'image':'images';
  return `START D&U STENCIL — ${job.job_number} — CLEAN ROOM v1.1

ISOLATION GATE
The ${detail.photos.length} source ${imageWord} attached to THIS USER MESSAGE are the only visual inputs allowed for this generation. Do not retrieve, inspect, or use images from earlier messages, other chats, memory, AKS, Drive, Library, prior candidates, or prior generated outputs as visual references. If these source images are not present as native image attachments in this message, STOP and reply exactly: CLEAN ROOM INPUT FAILURE. Do not generate.

SOURCE ROLES
Inspect every attached source image first. Choose exactly ONE source image as the composition authority for head angle, eye direction, expression, ear geometry, silhouette, and facial proportions. If the submission notes explicitly designate a photo or composition, that instruction controls. Use every other source only to clarify the same pet's identity, markings, coat, and anatomy. Never average, merge, or substitute poses.

COMPOSITION — HEAD DOMINANT
Build a compact head-dominant portrait. The head, ears, muzzle, and upper neck should fill the composition.
Crop out the chest, shoulders, forelegs, and torso. Do not include decorative body fur below the upper neck. Preserve enough upper-neck silhouette to make the portrait feel naturally finished, but the face must clearly dominate the artwork.

OUTPUT
Create exactly ONE black-on-white stencil artwork only. Pure black and pure white. Plain white background. Do not include the source photo, a comparison board, labels, options, mockups, a disc, background scenery, or a second candidate.

VISUAL TARGET
Preserve the specific pet's recognizable identity and meaningful asymmetry. Preserve the eyes, muzzle/nose, head shape, ears, expression, and distinctive markings. Use clean decisive black masses and deliberate medium-to-large white openings. Keep natural cheeks, jaw, chin, and coat direction. Prefer a small number of grouped tapered fur openings over repeated spikes or scratchboard texture.

MANUFACTURABILITY BIAS
Treat the finished artwork as 190.5 mm / 7.5 inches wide. White represents retained adhesive vinyl.

- Any enclosed or floating white piece must be at least 2.0 mm × 2.0 mm at final size. If EITHER dimension would be smaller, remove it, merge it into a neighboring white region, or enlarge it without changing identity.
- Any meaningful connected white bridge or neck that continues for 0.4 mm or longer must be at least 1.0 mm wide.
- Do not create isolated white dots, pinholes, confetti specks, stippling, tiny wedges, hairline slivers, scratchboard flecks, or fields of micro-fur marks.
- When fur texture would require many tiny marks, represent the same light/dark structure with FEWER, LARGER, connected or clearly durable white openings.
- Err on the side of removing low-value micro-detail. Do not preserve a tiny mark merely because it exists in the photograph.
- Do not solve manufacturability by globally smoothing the face, genericizing anatomy, filling important facial structure, or creating crude black blobs.

These dimensions are generation targets, not production certification. Final cut readiness is determined downstream.

PRE-SHOW CHECK
Before presenting the image, inspect the entire artwork against the chosen composition source.
Internally reject and regenerate if:
- obvious tiny floating white specks or hairline white slivers remain;
- the portrait includes unnecessary chest/body area;
- the face is not the dominant composition;
- likeness, pose, expression, eye placement, muzzle, ears, or key markings materially changed.

Show only one serious artwork candidate.

Submission notes: ${job.notes||'None'}`;
}
