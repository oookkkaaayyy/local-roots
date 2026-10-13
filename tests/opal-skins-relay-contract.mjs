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
  assert.deepEqual(f9, { schema: "hbnf-live-v1", active: true, label: "F9", acePot: 79, entries: ["AVA T 1", "BO SM 0"] });
  const same = JSON.parse(shell(`skins_build_snapshot "$RELAY_FIXTURE"`, structuredClone(base)));
  assert.deepEqual(same, f9, "unchanged source scores produce an identical snapshot");

  const b9 = structuredClone(base);
  b9.live.label = "B9";
  b9.live.entries = ["Cy/Dee 2"];
  assert.deepEqual(JSON.parse(shell(`skins_build_snapshot "$RELAY_FIXTURE"`, b9)), {
    schema: "hbnf-live-v1", active: true, label: "B9", acePot: 79, entries: ["CY/DE 2"],
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

  const installedSource = spawnSync("git", ["show", "d01a2f6f5ae02deb0901dc48490de0cd777ee9fa:firmware/phase2/integration-r6-f89-compact-font/usermod/usermod_hbnf_foundation_v1.cpp"], { cwd: root, encoding: "utf8" });
  assert.equal(installedSource.status, 0, installedSource.stderr);
  assert.match(installedSource.stdout, /server\.on\("\/hbnf\/build\.json"/);
  assert.match(installedSource.stdout, /AsyncCallbackJsonWebHandler\* liveHandler=new AsyncCallbackJsonWebHandler\("\/hbnf\/live"/);
  assert.match(installedSource.stdout, /request->send\(403,"application\/json","\{\\"ok\\":false\}"\)/);
  assert.match(installedSource.stdout, /request->send\(200,"application\/json","\{\\"ok\\":true\}"\)/);
  assert.match(installedSource.stdout, /input\.size\(\)>20/);
  assert.match(installedSource.stdout, /n>12/);
  assert.match(installedSource.stdout, /constrain\(pages\*1900u\+900u,2800u,20000u\)/);
  assert.match(installedSource.stdout, /if\(!hbnfRenderCommandOverlay\(f\.controls\.matrixBrightness,f\.vibe\)\)hbnfRenderLiveOverlay/);
  assert.doesNotMatch(installedSource.stdout, /hbnfMatrixSkinsPollTask/, "installed source needs an external poller");
  console.log("PASS: F9/B9 snapshot formatting, selector-version fail-closed, long-name compaction, changed/unchanged, malformed/over-cap rejection, stale suppression, 4-minute scheduling, manual/game suppression, exact target headers, verified TLS, installed Matrix receiver/renderer limits, and reproducible key-free package assembly");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
