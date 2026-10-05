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
Keep the portrait compact and head-dominant: the head, ears, muzzle, and upper neck should fill the composition. Crop out the chest, shoulders, forelegs, and torso. Do not include decorative body fur below the upper neck. Preserve enough upper-neck silhouette to make the portrait feel naturally finished. This crop target does not change the locked composition source, pose, head angle, expression, or identity.

OUTPUT
Create ONE strictly binary stencil artwork only: every pixel must be pure black (#000000) or pure white (#FFFFFF). No gray, grayscale, soft shading, or antialias-like gray pixels anywhere, especially in the nose, eyes, and muzzle. Do not include isolated white specks or flecks; remove or merge details too small to cut cleanly. Do not include the source photo, a comparison board, labels, options, mockups, a disc, background scenery, or a second candidate.

VISUAL TARGET
Match the style references' readable stencil abstraction: confident outer contour, broad connected black shapes, a small number of intentional white openings, and localized coat marks only where they clarify form. Preserve this pet's recognizable identity, meaningful asymmetry, natural cheek/jaw/chin massing, eye placement, muzzle/nose, head shape, ears, expression, and distinctive markings. Do not trace photographic fur into high-frequency marks. Avoid scratchboard/engraving texture, repeated hairline spikes, stippling, micro-speckle, tiny decorative slivers, artificial eye rings/catchlights, generic breed-icon simplification, arbitrary black blobs, or detail that weakens likeness. When uncertain, simplify the coat before simplifying the face.

MANUFACTURABILITY BIAS
Treat the finished artwork as ${DU_ARTWORK_WIDTH_MM} mm / 7.5 inches wide. White represents retained adhesive vinyl.
- Avoid any enclosed or floating white piece whose width OR height would be below ${DU_MIN_FLOATING_WHITE_MM.toFixed(1)} mm at final size. Merge it naturally into a larger white region, enlarge it without distorting identity, or remove low-value detail.
- Avoid meaningful connected white bridges or necks narrower than ${DU_MIN_CONNECTED_WHITE_WIDTH_MM.toFixed(1)} mm when they continue for ${DU_MIN_CONNECTED_WHITE_LENGTH_MM.toFixed(1)} mm or more.
- Remove isolated white specks and tiny flecks. Replace dense fields of fur dots, pinholes, hairline wedges, and scratchboard marks with FEWER, LARGER, deliberate tapered white openings that follow natural coat direction.
- Do not achieve safety by globally smoothing the face, genericizing anatomy, filling important facial structure, or creating crude black blobs. Preserve medium and large identity-bearing detail aggressively.

These are generation targets, not production certification. The downstream deterministic productionizer and physical validator decide final cut readiness.

PRE-SHOW CHECK
Verify the image is strictly two-tone pure black and pure white at full resolution, with no gray pixels or isolated tiny white specks. Compare the result first against the composition source for identity and anatomy, then against the style references for abstraction, edge quality, and detail scale. Reject and regenerate if it reads as scratchboard/engraving, has repeated fur spikes or dense micro-detail, materially changes identity, expression, or anatomy, or departs from the accepted stencil language. Do not present a weak draft as finished. Show one serious artwork candidate only after both comparisons pass.

Submission notes: ${notes?.trim()||'None'}`;
}
