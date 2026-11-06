/* #116 next independent increment: prevent paired-local TUNE from silently
 * acknowledging an incomplete semantic payload. REVIEW_ONLY; does NOT alter
 * the accepted C9 six-source-asset hashes or installed Owner PWA. Once C9
 * PWA-only phase1A is installed, consume this exact narrow change into the
 * next admitted release with fresh hashes/rollback and source tests.
 * Preserve the existing cloud path for fields not native to original R6.
 */
import {readFileSync} from "node:fs";
const changes=[
  {
    "file": "hbnf-cart.js",
    "before": "if (localControlActive && localOwnerControl.supports(body.type, body.payload)) {\n        return localOwnerControl.command(token, body.type, body.payload);\n      }",
    "after": "if (localControlActive && localOwnerControl.supports(body.type, body.payload, body.changedFields)) {\n        return localOwnerControl.command(token, body.type, body.payload, body.changedFields);\n      }"
  },
  {
    "file": "hbnf-cart.js",
    "before": "if (body.action === \"command\" && localControlActive && localOwnerControl.supports(body.type, body.payload)) {",
    "after": "if (body.action === \"command\" && localControlActive && localOwnerControl.supports(body.type, body.payload, body.changedFields)) {"
  },
  {
    "file": "hbnf-cart.js",
    "before": "changedFields: OPAL_LOCAL_PWA ? changedFields : undefined,",
    "after": "changedFields: changedFields,"
  },
  {
    "file": "hbnf-cart-local.js",
    "before": "if (this.opalDirect && type === \"TUNE\" && Array.isArray(changedFields) && changedFields.length) {\n      const supported = new Set([\"matrixBrightness\", \"auxBrightness\", \"motion\", \"audioResponse\"]);\n      return changedFields.every(key => supported.has(key));\n    }",
    "after": "if (type === \"TUNE\") {\n      const supported = new Set([\"matrixBrightness\", \"auxBrightness\", \"motion\", \"audioResponse\"]);\n      if (Array.isArray(changedFields) && changedFields.length) return changedFields.every(key => supported.has(key) && Object.prototype.hasOwnProperty.call(payload || {}, key));\n      if (!payload || !Object.keys(payload).length || Object.keys(payload).some(key => !supported.has(key))) return false;\n    }"
  },
  {
    "file": "hbnf-cart-local.js",
    "before": "if (!this.supports(type, payload)) throw new Error(`This command is not yet available through offline local control: ${type}`);\n    // Keep a stable pre-command record",
    "after": "if (!this.supports(type, payload, changedFields)) throw new Error(`This command is not yet available through offline local control: ${type}`);\n    const effectivePayload = type === \"TUNE\" && Array.isArray(changedFields) && changedFields.length\n      ? Object.fromEntries(changedFields.map(key => [key, payload[key]])) : (payload || {});\n    // Keep a stable pre-command record"
  },
  {
    "file": "hbnf-cart-local.js",
    "before": "const patch = this.module.buildPatch(type, payload || {});",
    "after": "const patch = this.module.buildPatch(type, effectivePayload);"
  },
  {
    "file": "hbnf-cart-local.js",
    "before": "const state = await this.transport.command(type, payload || {});",
    "after": "const state = await this.transport.command(type, effectivePayload);"
  }
];
export function patchedFiles(){
 const out={};
 for(const file of ["hbnf-cart.js","hbnf-cart-local.js"]){
  let src=readFileSync(new URL("../opal/owner-v1201-7target/owner-pwa/"+file,import.meta.url),"utf8");
  for(const x of changes.filter(c=>c.file===file)){
   if(src.split(x.before).length!==2)throw new Error("EXACT_C9_SOURCE_DRIFT:"+file);
   src=src.replace(x.before,x.after);
  }
  out[file]=src;
 }
 return out;
}
export const changedFileNames=["hbnf-cart.js","hbnf-cart-local.js"];
