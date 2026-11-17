export const DU_GENERATION_PROMPT_VERSION='reference-anchored-v3.1';
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
  return `START D&U STENCIL — ${jobNumber} — REFERENCE-ANCHORED v3.1

ISOLATION GATE
The ${sourceCount} source ${imageWord} and the numbered 03-STYLE-REFERENCE stencil images attached to THIS USER MESSAGE are the complete visual input set for this generation. Do not retrieve, inspect, or use any other images from earlier messages, other chats, memory, AKS, Drive, Library, prior candidates, or prior generated outputs. If the composition source or at least three style references are missing as native image attachments in this message, STOP and reply exactly: REQUIRED INPUT FAILURE. Do not generate.

SOURCE ROLES
Use 01-APPROVED-COMPOSITION as the sole authority for pose, crop, head angle, eye direction, expression, ear geometry, silhouette, and framing. Use every 02-IDENTITY-REFERENCE image only to clarify the same pet's identity, markings, coat, and anatomy. Never average, merge, or substitute poses.

STYLE ROLES — CONTROLLED HOUSE STYLE
Use each 03-STYLE-REFERENCE image only to learn the accepted D&U stencil language: black/white balance, edge character, scale and spacing of cutouts, face-versus-fur detail, and finished crop. These are different pets. Never copy their identity, markings, pose, expression, eye shape, or anatomy into the subject. Keep the same restrained, readable graphic treatment across attempts; style references are mandatory controls, not optional inspiration.

COMPOSITION — HEAD DOMINANT
Keep the portrait compact and head-dominant: the head, ears, muzzle, and upper neck should fill the composition. Crop out the chest, shoulders, forelegs, and torso. Do not include decorative body fur below the upper neck. FRAMING: the face is the subject. The head from ear tips to chin must fill about 80 percent of the image height, centered, with even margins. Define the chin with a clear contour. Below the chin show only a short neck ruff of about 15 to 20 percent of the head height, ending in a single curved ruff outline. Do not omit the chin and neck entirely, and do not leave a tall empty or neck-filled area below the chin. This crop target does not change the locked composition source, pose, head angle, expression, or identity.

OUTPUT
Create ONE strictly binary stencil artwork only: every pixel must be pure black (#000000) or pure white (#FFFFFF). No gray, grayscale, soft shading, or antialias-like gray pixels anywhere, especially in the nose, eyes, and muzzle. Do not include isolated white specks or flecks; remove or merge details too small to cut cleanly. Do not include the source photo, a comparison board, labels, options, mockups, a disc, background scenery, or a second candidate.

VISUAL TARGET
Match the style references' readable stencil abstraction: confident outer contour, broad connected black shapes, intentional white openings, and coat marks that follow this pet's actual fur direction. Keep the face rich but graphic: preserve the main forehead stripes, cheek and brow markings and the larger fur tufts at the ears, cheeks and ruff as bold tapered shapes, at roughly the detail level of the style references. Do not render individual hairs, fine hatching or engraving lines, and do not reduce the coat to a few large blobs. Do not trace photographic fur into high-frequency marks. Avoid scratchboard/engraving texture, repeated hairline spikes, stippling, micro-speckle, tiny decorative slivers, artificial eye rings/catchlights, generic breed-icon simplification, arbitrary black blobs, or detail that weakens likeness. When uncertain, simplify the coat before simplifying the face.

MANUFACTURABILITY BIAS
Treat the finished artwork as ${DU_ARTWORK_WIDTH_MM} mm / 7.5 inches wide. White represents retained adhesive vinyl.
- Avoid any enclosed or floating white piece whose width OR height would be below ${DU_MIN_FLOATING_WHITE_MM.toFixed(1)} mm at final size. Merge it naturally into a larger white region, enlarge it without distorting identity, or remove low-value detail.
- Avoid meaningful connected white bridges or necks narrower than ${DU_MIN_CONNECTED_WHITE_WIDTH_MM.toFixed(1)} mm when they continue for ${DU_MIN_CONNECTED_WHITE_LENGTH_MM.toFixed(1)} mm or more.
- Remove isolated white specks and tiny flecks. Replace dense fields of fur dots, pinholes, hairline wedges, and scratchboard marks with deliberate tapered white openings at least this wide that follow natural coat direction. Do not remove medium-sized markings to meet this limit; a downstream tool automatically widens or removes any remaining thin parts.
- Do not achieve safety by globally smoothing the face, genericizing anatomy, filling important facial structure, or creating crude black blobs. Preserve medium and large identity-bearing detail aggressively.

These are generation targets, not production certification. The downstream deterministic productionizer and physical validator decide final cut readiness.

PRE-SHOW CHECK
Verify the image is strictly two-tone pure black and pure white at full resolution, with no gray pixels or isolated tiny white specks. Compare the result first against the composition source for identity and anatomy, then against the style references for abstraction, edge quality, and detail scale. Reject and regenerate if it reads as scratchboard/engraving, has repeated fur spikes or dense micro-detail, materially changes identity, expression, or anatomy, or departs from the accepted stencil language. Do not present a weak draft as finished. Show one serious artwork candidate only after both comparisons pass.

Submission notes: ${notes?.trim()||'None'}`;
}
