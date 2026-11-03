#!/usr/bin/env bash
# Exact-source, non-actuating Cart Matrix R6 Owner-priority candidate build.
# CI only. Never addresses a device, invokes OTA, or enables a runtime sender.
set -Eeuo pipefail
export LC_ALL=C
export SOURCE_DATE_EPOCH=1791850000
ROOT="$(git rev-parse --show-toplevel)"
WORK="$ROOT/.trackc-r6-build"
OUT="$ROOT/.trackc-r6-build-out"
ENV=hbnf_matrix_wled16_packet20_diag
R6=00e6552ffe65a3dbd6768b0e017fd22226c5b86f
WLED=29b389df1c1aaec6ff53aea742d17063b985906c
FASTLED=adedfc40e73fb80f8e930318781036d8fe1dbd9f
MOD=firmware/phase2/integration-r6-f89-compact-font/usermod
PATCH=staging/cart116-glow-v35-exact-review/track-c-r6-priority/hbnf-r6-owner-text-priority-v1-review.patch
W="$WORK/WLED"
mkdir -p "$WORK/r6" "$OUT"
echo "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH"
test "$(sha256sum "$ROOT/$PATCH" | cut -d' ' -f1)" = 9ce39687374ab0895834df750571e2d7f171751d16a8cd02ec20c6654fd5709a
git cat-file -e "$R6^{commit}"
git archive "$R6" "$MOD" | tar -xf - -C "$WORK/r6"
test "$(sha256sum "$WORK/r6/$MOD/usermod_hbnf_foundation_v1.cpp" | cut -d' ' -f1)" = 87bdbd9a68425e97cd5b97641768c4e4a16a527c3dfadfca3d0cb4e3ea5c5559
(cd "$WORK/r6" && patch --batch --fuzz=0 --dry-run -p1 -i "$ROOT/$PATCH" && patch --batch --fuzz=0 -p1 -i "$ROOT/$PATCH")
test "$(sha256sum "$WORK/r6/$MOD/usermod_hbnf_foundation_v1.cpp" | cut -d' ' -f1)" = 6d89f623982a9045f7cd7527bd293ab2ea68d3727461b2ad359aeb47dd7001aa
echo "PASS: exact R6 source/patch/candidate source binding"
mkdir -p "$W"
git -C "$W" init -q
git -C "$W" fetch --quiet --depth 1 https://github.com/Aircoookie/WLED.git "$WLED"
git -C "$W" checkout --quiet --detach FETCH_HEAD
test "$(git -C "$W" rev-parse HEAD)" = "$WLED"
mkdir -p "$W/usermods/hbnf_foundation_v1" "$W/vendor"
cp -a "$WORK/r6/$MOD/." "$W/usermods/hbnf_foundation_v1/"
# This is the original R6 packet20 environment, NOT the unrelated C5 normal target.
git show "$R6:evidence/hbnf-phase2-integration-20261007/r5-offline-qualification-20261009/build-inputs/platformio_override.ini" > "$W/platformio_override.ini"
# FastLED's pinned render header includes SPI and Wire. The original R6
# dependency graph already links framework SPI 2.0.0 and Wire 2.0.0; make their
# discovery explicit without replacing their Arduino 2.0.18 implementations.
sed -i '/^lib_deps =$/a\  SPI\n  Wire' "$W/platformio_override.ini"
# Match the successful October 14 R6 build: include FastLED HEADERS from an external\n# pinned source checkout, not from WLED/vendor (a PlatformIO lib_extra_dirs).\n# Putting FastLED under WLED/vendor causes a second libFastLED.a and duplicate\n# global symbols when the usermod already compiles FastLED .cpp.hpp headers.\nmkdir -p "$WORK/FastLED"
git -C "$WORK/FastLED" init -q
git -C "$WORK/FastLED" fetch --quiet --depth 1 https://github.com/FastLED/FastLED.git "$FASTLED"
git -C "$WORK/FastLED" checkout --quiet --detach FETCH_HEAD
test "$(git -C "$WORK/FastLED" rev-parse HEAD)" = "$FASTLED"
# Only relocate original Mac-specific compiler include flag to this ephemeral runner.
sed -i 's|-I"/private/tmp/hbnf-p2-build/FastLED/src"|-I"'"$WORK"'/FastLED/src"|' "$W/platformio_override.ini"
grep -Fq "$WORK/FastLED/src" "$W/platformio_override.ini"
# Pin WLED packet20 source hook and exact R6 text-alpha API compatibility.
git show "$R6:firmware/phase2/integration-r4/packet20-frame-timing.patch" > "$WORK/packet20-frame-timing.patch"
(cd "$W" && patch --batch --fuzz=0 -p1 -i "$WORK/packet20-frame-timing.patch")
python3 - "$W" <<'PY'
import pathlib,sys
w=pathlib.Path(sys.argv[1])
updates={
 "wled00/fontmanager.h":[("void drawCharacter(uint32_t unicode, int16_t x, int16_t y, uint32_t color, uint32_t col2, int8_t rotate);",
 "void drawCharacter(uint32_t unicode, int16_t x, int16_t y, uint32_t color, uint32_t col2, int8_t rotate, uint8_t alpha=255);")],
 "wled00/fontmanager.cpp":[
 ("void FontManager::drawCharacter(uint32_t unicode, int16_t x, int16_t y, uint32_t color, uint32_t col2, int8_t rotate) {",
 "void FontManager::drawCharacter(uint32_t unicode, int16_t x, int16_t y, uint32_t color, uint32_t col2, int8_t rotate, uint8_t alpha) {"),
 ("_segment->setPixelColorXY(x0, y0, c.color32); // bounds checking is done in setPixelColorXY",
 "if(alpha==255)_segment->setPixelColorXY(x0, y0, c.color32);\n        else _segment->blendPixelColorXY(x0, y0, c.color32, alpha); // retain the rendered Matrix frame")],
 "pio-scripts/load_usermods.py":[
 ("from pathlib import Path   # For OS-agnostic path manipulation","from pathlib import Path   # For OS-agnostic path manipulation\nfrom typing import Optional"),
 ("def _predict_dep_name(entry: str) -> str | None:", "def _predict_dep_name(entry: str) -> Optional[str]:")],
 "pio-scripts/validate_modules.py":[
 ("import re\n","import re\nfrom typing import Optional\n"),
 ("def _flush_cu(comp_dir: str | None, name: str | None) -> None:",
  "def _flush_cu(comp_dir: Optional[str], name: Optional[str]) -> None:")],
 "tools/cdata.js":[("return Math.floor(Date.now() / 1000);",
 "const reproducible = Number(process.env.SOURCE_DATE_EPOCH || 0);\n  return reproducible > 0 ? reproducible : Math.floor(Date.now() / 1000);")]
}
for rel,edits in updates.items():
 p=w/rel;s=p.read_text()
 for old,new in edits:
  if s.count(old)!=1:raise SystemExit("PINNED_WLED_SOURCE_MISMATCH:"+rel+":"+old[:70])
  s=s.replace(old,new,1)
 p.write_text(s)
print("PASS pinned WLED compatibility source patches")
PY
# Source tree setup only; no device hostnames, serial ports, OTA or network commands
# other than fetching public pinned build dependencies.
(cd "$W" && python3 -m platformio --version && python3 -m platformio pkg install -e "$ENV")
# Original successful R6 usermod compiler command explicitly includes the
# installed Arduino 2.0.18 framework's SPI/Wire header locations. PlatformIO
# LDF on a clean Linux runner did not propagate these through pinned FastLED.
SPI_ROOT="$HOME/.platformio/packages/framework-arduinoespressif32/libraries/SPI/src"
WIRE_ROOT="$HOME/.platformio/packages/framework-arduinoespressif32/libraries/Wire/src"
test -f "$SPI_ROOT/SPI.h"
test -f "$WIRE_ROOT/Wire.h"
python3 - "$W/platformio_override.ini" "$SPI_ROOT" "$WIRE_ROOT" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]);source=p.read_text()
matches=[x for x in source.splitlines() if x.startswith('build_flags = ${env:esp32dev.build_flags} -I"')]
if len(matches)!=1:raise SystemExit("R6_build_flags_anchor_mismatch")
new=matches[0]+' -I"'+sys.argv[2]+'" -I"'+sys.argv[3]+'"'
p.write_text(source.replace(matches[0],new))
print("PASS original R6 SPI/Wire compiler include paths restored")
PY
VENDOR="$W/.pio/libdeps/$ENV/animartrix/ANIMartRIX.h"
test -f "$VENDOR"
mkdir -p "$W/vendor/hbnf-animartrix"
cp "$VENDOR" "$W/vendor/hbnf-animartrix/ANIMartRIX.h"
# Exact C5 R4 clock patch restored from pinned archived build closure.
CLOCK="$ROOT/staging/cart116-glow-v35-exact-review/track-c-r6-priority/animartrix-clock-pinned.patch"
test "$(sha256sum "$CLOCK" | cut -d' ' -f1)" = f38d260d0f1f50644f24166fa92377d48ac0ffbe292b57f8ec5db39579af10c4
(cd "$W" && patch --batch --fuzz=0 -p1 -i "$CLOCK")
test "$(sha256sum "$W/vendor/hbnf-animartrix/ANIMartRIX.h"|cut -d' ' -f1)" = bd9d146e2ce5fde991a895ccc2ad2773df1cc77cb815381679c17c6425d7bbe8
git show "$R6:scripts/hbnf_packet20_r4_fastled_backport.py" > "$WORK/hbnf_packet20_r4_fastled_backport.py"
python3 "$WORK/hbnf_packet20_r4_fastled_backport.py" --header "$W/vendor/hbnf-animartrix/ANIMartRIX.h" --fastled-root "$WORK/FastLED" --apply
test "$(sha256sum "$W/vendor/hbnf-animartrix/ANIMartRIX.h"|cut -d' ' -f1)" = a2bc03b5196dbaacb39e56885ed9301106b15c4916e0b906f86c02db1601ec1b
cp "$W/vendor/hbnf-animartrix/ANIMartRIX.h" "$VENDOR"
echo "PASS exact R6 normal usermod, pinned FastLED and ANIMartrix dependency"
# The WLED 16.0.1 pinned checkout does not version generated html_ui.h.
# Rebuild only from pinned WLED package-lock + SOURCE_DATE_EPOCH.
(cd "$W" && npm ci --ignore-scripts --no-audit --no-fund && npm run build)
test -s "$W/wled00/html_ui.h"
echo "PASS pinned WLED UI header generated at fixed SOURCE_DATE_EPOCH"
echo "BEGIN PLATFORMIO BUILD"
(cd "$W" && python3 -m platformio run -v -j 1 -e "$ENV") 2>&1 | tee "$OUT/BUILD_FULL.log"
BIN="$W/.pio/build/$ENV/firmware.bin"
ELF="$W/.pio/build/$ENV/firmware.elf"
MAP="$W/.pio/build/$ENV/firmware.map"
test -s "$BIN"; test -s "$ELF"; test -s "$MAP"
cp "$BIN" "$OUT/firmware.bin"
cp "$MAP" "$OUT/firmware.map"
python3 - "$OUT" <<'PY'
import pathlib,sys,hashlib,json,re
d=pathlib.Path(sys.argv[1]);b=(d/'firmware.bin').read_bytes()
h=hashlib.sha256(b).hexdigest();n=len(b)
expected=b'hbnf-cart2-r6-native-overlay-owner-safe-review-20261103'
assert expected in b, "new candidate release marker MISSING"
assert n<=0x180000,(n,"EXCEEDS OTA SLOT")
assert b'hbnf-cart2-phase2-r6-skins-readable-20261014' in b, "original R6 lineage missing"
for marker in [b'native-overlay-owner-text-priority-v1',b'foundation-vibe-audio-r5-unfrozen',b'phase2-brightness-output-v1']:
 assert marker in b,marker
r={"schema":"hbnf-cart116-firmware-candidate-build-v1","status":"BUILT_NO_DEVICE_ACCEPTANCE",
 "binary_sha256":h,"binary_size_bytes":n,"ota_slot_bytes":0x180000,
 "ota_headroom_bytes":0x180000-n,"rollback_sha256":"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d",
 "source_sha256":"6d89f623982a9045f7cd7527bd293ab2ea68d3727461b2ad359aeb47dd7001aa",
 "wled_commit":"29b389df1c1aaec6ff53aea742d17063b985906c",
 "environment":"hbnf_matrix_wled16_packet20_diag","platformio":"6.1.18",
 "candidate_release":"hbnf-cart2-r6-native-overlay-owner-safe-review-20261103",
 "device_write":False,"install_authorized":False,"owner_field_acceptance":False,
 "build_log_sha256":hashlib.sha256((d/'BUILD_FULL.log').read_bytes()).hexdigest()}
(d/'BUILD_RECEIPT.json').write_text(json.dumps(r,indent=2)+"\n")
(d/'SHA256SUMS.txt').write_text("".join(hashlib.sha256(p.read_bytes()).hexdigest()+"  "+p.name+"\n" for p in [d/'firmware.bin',d/'firmware.map',d/'BUILD_FULL.log',d/'BUILD_RECEIPT.json']))
print(json.dumps(r,indent=2))
PY
echo "PASS exact pinned R6 candidate firmware built offline; no installation or device action"
