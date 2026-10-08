import fs from "node:fs";
const gates=JSON.parse(fs.readFileSync("config/HBNF_COORDINATED_RELEASE_GATES.json","utf8"));
const paths=[
  "hbnf-final-controller/hbnf-cart.js",
  "hbnf-final-controller/hbnf-cart-semantic.mjs",
  "hbnf-final-controller/hbnf-cart-net.mjs",
  "hbnf-final-controller/hbnf-cart-ui-v6.mjs",
  "hbnf-final-controller/hbnf-cart-features.mjs",
  "hbnf-final-controller/hbnf-cart-skins-score.mjs",
  "hbnf-final-controller/hbnf-cart-sw.js",
  "hbnf-final-controller/guest/hbnf-cart/guest.js"
];

const findings=[];
for (const path of paths) {
  const src=fs.readFileSync(path,"utf8");
  const row={
    path,
    optionalChaining:(src.match(/\?\./g)||[]).length,
    nullishCoalescing:(src.match(/\?\?/g)||[]).length,
    cryptoRandomUUID:(src.match(/crypto\.randomUUID/g)||[]).length,
    replaceAll:(src.match(/\.replaceAll\(/g)||[]).length,
    replaceChildren:(src.match(/\.replaceChildren\s*\(/g)||[]).length,
    objectFromEntries:(src.match(/Object\.fromEntries/g)||[]).length,
    structuredClone:(src.match(/structuredClone/g)||[]).length
  };
  findings.push(row);
  console.log(path+" "+JSON.stringify(row));
}
const incompatible=findings.filter(x=>x.optionalChaining||x.nullishCoalescing||x.cryptoRandomUUID||x.replaceAll||x.replaceChildren||x.objectFromEntries||x.structuredClone);
console.log("HBNF_IOS12_INCOMPATIBLE_SOURCE_FILES="+incompatible.length);
if (incompatible.length) {
  throw new Error("Unsupported iOS12 source syntax/API remains; source audit failed.");
}
console.log("HBNF_IOS12_GATE_STATE="+String(gates.productionBlockers.fullControllerIos12CompatibilityVerified));
