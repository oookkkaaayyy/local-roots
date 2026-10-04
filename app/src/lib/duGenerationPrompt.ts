export const DU_GENERATION_PROMPT_VERSION='clean-room-v2.1';
export const DU_ARTWORK_WIDTH_MM=190.5;
export const DU_MIN_FLOATING_WHITE_MM=2.0;
export const DU_MIN_CONNECTED_WHITE_WIDTH_MM=1.0;
export const DU_MIN_CONNECTED_WHITE_LENGTH_MM=0.4;

type PromptInput={
  jobNumber:string;
  sourceCount:number;
  notes:string|null;
};

export function buildDuGenerationPrompt({jobNumber,sourceCount,notes}:PromptInput){
  const imageWord=sourceCount===1?'image':'images';
  return `START D&U STENCIL — ${jobNumber} — CLEAN ROOM v2.1

ISOLATION GATE
The ${sourceCount} source ${imageWord} attached to THIS USER MESSAGE are the only visual inputs allowed for this generation. Do not retrieve, inspect, or use images from earlier messages, other chats, memory, AKS, Drive, Library, prior candidates, or prior generated outputs as visual references. If these source images are not present as native image attachments in this message, STOP and reply exactly: CLEAN ROOM INPUT FAILURE. Do not generate.

SOURCE ROLES
Use 01-APPROVED-COMPOSITION as the sole authority for pose, crop, head angle, eye direction, expression, ear geometry, silhouette, and framing. Use every 02-IDENTITY-REFERENCE image only to clarify the same pet's identity, markings, coat, and anatomy. Never average, merge, or substitute poses.

OUTPUT
Create ONE black-on-white stencil artwork only. Do not include the source photo, a comparison board, labels, options, mockups, a disc, background scenery, or a second candidate.

VISUAL TARGET
Preserve the specific pet's recognizable identity and meaningful asymmetry. Use clean decisive black masses, deliberate medium-scale white openings, natural cheeks/jaw/chin, and selective coat-direction detail rather than repetitive spikes. Preserve the eyes, muzzle/nose, head shape, ears, expression, and distinctive markings. Avoid generic breed-icon simplification, scratchboard texture, stippling or micro-speckle, tiny decorative slivers, artificial eye rings/catchlights, arbitrary black blobs, and detail that weakens likeness.

MANUFACTURABILITY BIAS
Treat the finished artwork as ${DU_ARTWORK_WIDTH_MM} mm / 7.5 inches wide. White represents retained adhesive vinyl.
- Avoid any enclosed or floating white piece whose width OR height would be below ${DU_MIN_FLOATING_WHITE_MM.toFixed(1)} mm at final size. Merge it naturally into a larger white region, enlarge it without distorting identity, or remove low-value detail.
- Avoid meaningful connected white bridges or necks narrower than ${DU_MIN_CONNECTED_WHITE_WIDTH_MM.toFixed(1)} mm when they continue for ${DU_MIN_CONNECTED_WHITE_LENGTH_MM.toFixed(1)} mm or more.
- Replace dense fields of tiny fur specks, dots, pinholes, flecks, hairline wedges, and scratchboard marks with FEWER, LARGER, deliberate tapered white openings that follow natural coat direction.
- Do not achieve safety by globally smoothing the face, genericizing anatomy, filling important facial structure, or creating crude black blobs. Preserve medium and large identity-bearing detail aggressively.

These are generation targets, not production certification. The downstream deterministic productionizer and physical validator decide final cut readiness.

PRE-SHOW CHECK
Compare the rendered pixels directly against the composition source before presenting it. Internally reject any result that materially changes the subject, pose, expression, key anatomy, or identity. Also reject and redo internally if obvious fields of tiny floating white specks remain. Show only one serious artwork candidate.

Submission notes: ${notes?.trim()||'None'}`;
}
