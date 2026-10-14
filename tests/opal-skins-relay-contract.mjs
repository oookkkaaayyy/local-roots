import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const core = join(root, "staging/coordinated-backend/opal/hbnf-skins-relay-core.sh");
const service = join(root, "staging/coordinated-backend/opal/hbnf-skins-relay");
const temp = mkdtempSync(join(tmpdir(), "opal-skins-relay-test-"));
const bin = join(temp, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "jsonfilter"), `#!/usr/bin/env node
const fs=require('fs');let file='', expr='';const a=process.argv.slice(2);for(let i=0;i<a.length;i++){if(a[i]==='-i')file=a[++i];else if(a[i]==='-e')expr=a[++i];}
let x=JSON.parse(fs.readFileSync(file,'utf8'));
if(expr==='@.live.entries[*]'){for(const v of (x.live?.entries||[]))console.log(typeof v==='string'?v:JSON.stringify(v));process.exit(0);}
if(expr.startsWith('@.')){for(const k of expr.slice(2).split('.'))x=x==null?undefined:x[k];if(x===undefined)process.exit(1);console.log(x===null?'null':typeof x==='string'?x:String(x));process.exit(0);}
process.exit(2);
`);
chmodSync(join(bin, "jsonfilter"), 0o755);

function shell(script, fixture, expectedSuccess = true) {
  const input = join(temp, "input.json");
  writeFileSync(input, JSON.stringify(fixture));
  const run = spawnSync("/bin/sh", ["-c", `. '${core}'\n${script}`], {
    cwd: root,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RELAY_FIXTURE: input },
    encoding: "utf8",
  });
  if (expectedSuccess) assert.equal(run.status, 0, run.stderr || run.stdout);
  else assert.notEqual(run.status, 0, "unsafe fixture should fail closed");
  return run.stdout.trim();
}

try {
  const base = { selectorVersion: "skins-front-lock-v1", live: { active: true, event: "skins", label: "F9", acePot: 79, entries: ["Ava Thompson 1", "Bo Smith 0"] } };
  const f9 = JSON.parse(shell(`skins_build_snapshot "$RELAY_FIXTURE"`, base));
  assert.deepEqual(f9, { schema: "hbnf-live-v1", active: true, label: "F9", acePot: 79, entries: ["Ava Thompson 1", "Bo Smith 0"] });
  const same = JSON.parse(shell(`skins_build_snapshot "$RELAY_FIXTURE"`, structuredClone(base)));
  assert.deepEqual(same, f9, "unchanged source scores produce an identical snapshot");

  const b9 = structuredClone(base);
  b9.live.label = "B9";
  b9.live.entries = ["Cy/Dee 2"];
  assert.deepEqual(JSON.parse(shell(`skins_build_snapshot "$RELAY_FIXTURE"`, b9)), {
    schema: "hbnf-live-v1", active: true, label: "B9", acePot: 79, entries: ["Cy/Dee 2"],
  });

  const inactive = { selectorVersion: "skins-front-lock-v1", live: { active: false, event: null, label: "", acePot: 0, entries: [] } };
  assert.equal(JSON.parse(shell(`skins_build_snapshot "$RELAY_FIXTURE"`, inactive)).active, false);
  assert.equal(shell(`skins_snapshot_changed one two; echo $?`, base), "0", "changed snapshots trigger a post");
  assert.equal(shell(`skins_snapshot_changed one one; echo $?`, base), "1", "identical snapshots do not trigger a changed-score post");

  const v23 = structuredClone(base); delete v23.selectorVersion;
  shell(`skins_build_snapshot "$RELAY_FIXTURE"`, v23, false);
  const badActive = structuredClone(base); delete badActive.live.active;
  shell(`skins_build_snapshot "$RELAY_FIXTURE"`, badActive, false);
  const badScore = structuredClone(base); badScore.live.entries[0] = 'Ava 1"';
  shell(`skins_build_snapshot "$RELAY_FIXTURE"`, badScore, false);
  const unsupportedName = structuredClone(base); unsupportedName.live.entries[0] = "José 1";
  shell(`skins_build_snapshot "$RELAY_FIXTURE"`, unsupportedName, false);
  const tooLongName = structuredClone(base); tooLongName.live.entries[0] = `${"A".repeat(59)} 1`;
  shell(`skins_build_snapshot "$RELAY_FIXTURE"`, tooLongName, false);
  const tooMany = structuredClone(base); tooMany.live.entries = Array.from({ length: 21 }, (_, i) => `P${i} ${i}`);
  shell(`skins_build_snapshot "$RELAY_FIXTURE"`, tooMany, false);

  const noOverlay = { state: { HBNF: { overlayId: null, gameActive: false } } };
  const manual = { state: { HBNF: { overlayId: "manual-text", gameActive: false } } };
  const game = { state: { HBNF: { overlayId: null, gameActive: true } } };
  assert.equal(shell(`skins_overlay_blocked "$RELAY_FIXTURE"; echo $?`, noOverlay), "1");
  assert.equal(shell(`skins_overlay_blocked "$RELAY_FIXTURE"; echo $?`, manual), "0");
  assert.equal(shell(`skins_overlay_blocked "$RELAY_FIXTURE"; echo $?`, game), "0");
  assert.equal(shell(`skins_target_matches 704bca5b345c hbnf-cart2-phase2-r6-vibe-first-ui-20261012; echo $?`, base), "0");
  assert.equal(shell(`skins_target_matches 704bca5b345d hbnf-cart2-phase2-r6-vibe-first-ui-20261012; echo $?`, base), "1", "wrong Matrix identity is rejected");
  assert.equal(shell(`skins_redisplay_due 100 340 339 false 240 45; echo $?`, base), "0", "four-minute redisplay is due for a fresh snapshot");
  assert.equal(shell(`skins_redisplay_due 100 339 338 false 240 45; echo $?`, base), "1", "redisplay is not early");
  assert.equal(shell(`skins_redisplay_due 100 340 290 false 240 45; echo $?`, base), "1", "stale data does not redisplay");
  assert.equal(shell(`skins_redisplay_due 100 340 339 true 240 45; echo $?`, base), "1", "manual overlays/games suppress periodic redisplay");

  const serviceText = readFileSync(service, "utf8");
  assert.match(serviceText, /--max-time 8 --max-filesize 32768/);
  assert.match(serviceText, /--config \"\$AUTH\"/);
  assert.match(serviceText, /Host: \$MATRIX/);
  assert.match(serviceText, /Origin: http:\/\/\$MATRIX/);
  assert.match(serviceText, /Cache-Control: no-cache, no-store/);
  assert.match(serviceText, /POLL_SECONDS=15/);
  assert.match(serviceText, /skins_redisplay_due/);
  assert.match(serviceText, /if \[ -z "\$last_snapshot" \] && \[ "\$SNAPSHOT" != "\$inactive" \]; then[\s\S]*?post_matrix "\$inactive" && post_matrix "\$SNAPSHOT"/, "relay startup toggles an active snapshot so an identical Matrix-held snapshot is rendered");
  assert.match(serviceText, /Keep the Matrix's 120-second live-snapshot lease fresh[\s\S]*?if ! post_matrix "\$SNAPSHOT"; then/, "fresh unchanged snapshots renew the renderer lease without triggering a changed-score display");
  assert.doesNotMatch(serviceText, /MATRIX_LIVE_ACTIVE/, "the Matrix liveActive field is a 120-second freshness lease and must not reset the 240-second redisplay clock");
  assert.match(serviceText, /if \[ "\$last_uptime" -gt 0 \] && \[ "\$MATRIX_UPTIME" -lt "\$last_uptime" \]; then last_display=0; fi/, "Matrix reboot still resets the redisplay clock");
  assert.match(serviceText, /if ! fetch_scores; then/);
  assert.match(serviceText, /continue/);
  assert.doesNotMatch(serviceText, /curl[^\n]*-[kK](?:\s|$)/, "TLS verification must remain enabled");

  const packager = join(root, "scripts/package_hbnf_opal_skins_relay.py");
  const archiveA = join(temp, "package-a.tar.gz");
  const archiveB = join(temp, "package-b.tar.gz");
  const packedA = spawnSync("python3", [packager, "--out", archiveA], { cwd: root, encoding: "utf8" });
  const packedB = spawnSync("python3", [packager, "--out", archiveB], { cwd: root, encoding: "utf8" });
  assert.equal(packedA.status, 0, packedA.stderr);
  assert.equal(packedB.status, 0, packedB.stderr);
  assert.equal(JSON.parse(packedA.stdout).sha256, JSON.parse(packedB.stdout).sha256, "package output is deterministic");
  assert.equal(readFileSync(`${archiveA}.sha256`, "utf8"), `${JSON.parse(packedA.stdout).sha256}  package-a.tar.gz\n`);
  const packageCheck = spawnSync("python3", ["-c", `import tarfile,sys; t=tarfile.open(sys.argv[1], 'r:gz'); m=t.getmembers(); n=[x.name for x in m]; assert len(n)==6; assert any(x.endswith('/MANIFEST.json') for x in n); c=next(t.extractfile(x).read() for x in m if x.name.endswith('/hbnf-skins-relay.conf.example')); assert b'SET_FROM_EXISTING_MATRIX_SOURCE_WITHOUT_ECHOING' in c; assert b'sb_publishable' not in c; assert next(x for x in m if x.name.endswith('/hbnf-skins-relay')).mode & 0o111; assert next(x for x in m if x.name.endswith('/hbnf-skins-relay.init')).mode & 0o111; assert all(x.mode & 0o600 == 0o600 for x in m)`, archiveA], { cwd: root, encoding: "utf8" });
  assert.equal(packageCheck.status, 0, packageCheck.stderr);

  const installedSource = readFileSync(join(root, "firmware/phase2/integration-r6-f89-compact-font/usermod/usermod_hbnf_foundation_v1.cpp"), "utf8");
  const liveRenderer = installedSource.slice(installedSource.indexOf("static void hbnfRenderLiveOverlay"), installedSource.indexOf("static bool hbnfAcceptLiveSnapshot"));
  const liveAcceptor = installedSource.slice(installedSource.indexOf("static bool hbnfAcceptLiveSnapshot"), installedSource.indexOf("// AI: end", installedSource.indexOf("static bool hbnfAcceptLiveSnapshot")));
  assert.match(installedSource, /char entries\[20\]\[64\]/, "Matrix receiver keeps full bounded player text");
  assert.match(installedSource, /if\(!n\|\|n>63\)return false/);
  assert.match(installedSource, /hbnfLivePageDwellMs/);
  assert.match(installedSource, /next\.pageCount=\(uint8_t\)\(2u\+\(next\.count\+1u\)\/2u\)/);
  assert.match(installedSource, /next\.pageDwellMs\[0\]=5500u/);
  assert.match(installedSource, /overflow\*1000u\+15u\)\/16u/);
  assert.match(installedSource, /movedMs\*16u\/1000u/);
  assert.match(installedSource, /hbnfDrawLiveText\(first,1/);
  assert.match(installedSource, /hbnfDrawLiveText\(second,10/);
  assert.match(installedSource, /"AMOUNT N\/A"/, "the current acePot contract is not represented as dollars");
  const maxNameOverflow = 63 * 4 - 1 - 32;
  const maxNameDwellMs = 1200 + Math.ceil(maxNameOverflow * 1000 / 16);
  const maxTwentyPlayerCycleMs = 2 * 5500 + 10 * maxNameDwellMs;
  assert.ok(maxTwentyPlayerCycleMs < 240000, "a full maximum-size roster cycle ends before the 4-minute redisplay");
  assert.doesNotMatch(liveRenderer, /(?:^|[^0-9])(?:1900|20000)u/, "no 1.9-second cycling or 20-second cycle cap remains");
  assert.doesNotMatch(liveAcceptor, /(?:^|[^0-9])20000u|constrain\(pages/, "overlay duration includes every screen in the cycle");
  assert.match(installedSource, /if\(!hbnfRenderCommandOverlay\(f\.controls\.matrixBrightness,f\.vibe\)\)hbnfRenderLiveOverlay/);
  assert.doesNotMatch(installedSource, /hbnfMatrixSkinsPollTask/, "candidate reuses the installed external relay path");
  console.log("PASS: full-name relay projection, fail-closed unsupported names, changed/unchanged snapshots, stale suppression, exact 240s schedule, overlay suppression, installed receiver contract, two-row cycle rendering and reproducible key-free package assembly");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
