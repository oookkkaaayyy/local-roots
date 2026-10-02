import fs from "node:fs";
const gates=JSON.parse(fs.readFileSync("config/HBNF_COORDINATED_RELEASE_GATES.json","utf8"));
const paths=[
  "hbnf-final-controller/hbnf-cart.js",
  "hbnf-final-controller/hbnf-cart-semantic.mjs",
  "hbnf-final-controller/hbnf-cart-ui-v6.mjs",
  "hbnf-final-controller/hbnf-cart-features.mjs"
];

const findings=[];
for (const path of paths) {
  const src=fs.readFileSync(path,"utf8");
  const row={
    path,
    optionalChaining:(src.match(/\?\./g)||[]).length,
    nullishCoalescing:(src.match(/\?\?/g)||[]).length,
    cryptoRandomUUID:(src.match(/crypto\.randomUUID/g)||[]).length
  };
  findings.push(row);
  console.log(path+" "+JSON.stringify(row));
}
const incompatible=findings.filter(x=>x.optionalChaining||x.nullishCoalescing||x.cryptoRandomUUID);
console.log("HBNF_IOS12_INCOMPATIBLE_SOURCE_FILES="+incompatible.length);
if (gates.productionBlockers.fullControllerIos12CompatibilityVerified===true && incompatible.length) {
  throw new Error("Gate says full iOS12 compatibility is verified, but unsupported source syntax/API remains.");
}
console.log("HBNF_IOS12_GATE_STATE="+String(gates.productionBlockers.fullControllerIos12CompatibilityVerified));
