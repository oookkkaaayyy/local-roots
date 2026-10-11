#!/usr/bin/env python3
"""Compare the neutral-input bridge fast path against its exact pre-change source."""

from __future__ import annotations

import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASELINE = ROOT / "tests/fixtures/hbnf_audio_bridge_neutral_baseline.h"
CANDIDATE = ROOT / "firmware/phase2/integration-r6-cachefix/usermod/hbnf_animartrix_audio_bridge.h"

HARNESS = r'''#include <cstdint>
#include <cstdio>
struct um_data_t { uint8_t u_size; void **u_data; };
struct UsermodManager { static bool getUMData(um_data_t **, int) { return false; } };
static constexpr int USERMOD_ID_AUDIOREACTIVE=1;
#include "hbnf_animartrix_audio_bridge.h"

int main() {
  // Chill, Groove, Heavy, Psychedelic, Cosmic profile/style codes.
  const uint8_t vibes[][2]={{24,24},{112,104},{240,64},{202,204},{104,24}};
  const uint8_t scenes[]={0,219,220,221,222,223,224,225,226,227,228,229,230,231,
    232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,255};
  // Silent, energy-only (exercises the static audio-weighted diversity guard),
  // and active audio (checks the normal path remains unchanged).
  const uint8_t audio[][12]={
    {0,0,0,0,0,0,0,0,0,0,0,0},
    {0,0,0,0,0,0,73,0,0,0,0,0},
    {96,144,208,64,176,80,120,160,190,88,210,96}
  };
  uint64_t digest=1469598103934665603ULL;
  for(const auto &vibe:vibes) for(uint8_t scene:scenes) for(const auto &a:audio) {
    hbnf::AnimartrixAudioBridge bridge;
    bridge.beginFrameFromAudio(1234,vibe[0],vibe[1],255,256,32,16,scene,
      a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8],a[9],a[10],a[11]);
    for(int y=0;y<16;y++) for(int x=0;x<32;x++) {
      const uint8_t colors[][3]={
        {0,0,0}, {0,0,255}, {8,64,220}, {31,129,244},
        {255,255,255}, {static_cast<uint8_t>(x*7+y*3),
          static_cast<uint8_t>(x*2+y*13),static_cast<uint8_t>(255-x*5-y*2)}
      };
      for(const auto &color:colors) {
        uint8_t r=color[0],g=color[1],b=color[2];
        bridge.modulate(x,y,r,g,b);
        digest=(digest^r)*1099511628211ULL;
        digest=(digest^g)*1099511628211ULL;
        digest=(digest^b)*1099511628211ULL;
      }
    }
  }
  std::printf("%016llx\n",static_cast<unsigned long long>(digest));
}
'''


def run(header: pathlib.Path) -> str:
    with tempfile.TemporaryDirectory(prefix="hbnf-audio-neutral-") as temp:
        work = pathlib.Path(temp)
        shutil.copy(header, work / "hbnf_animartrix_audio_bridge.h")
        shutil.copy(CANDIDATE.parent / "hbnf_vibe16.h", work / "hbnf_vibe16.h")
        source = work / "main.cpp"
        source.write_text(HARNESS)
        binary = work / "bridge-test"
        subprocess.run(
            ["c++", "-std=c++17", "-O2", str(source), "-o", str(binary)],
            cwd=work, check=True, capture_output=True, text=True,
        )
        return subprocess.run(
            [str(binary)], check=True, capture_output=True, text=True
        ).stdout.strip()


def main() -> None:
    if not shutil.which("c++"):
        raise SystemExit("FAIL: a local C++ compiler is required")
    candidate = CANDIDATE.read_text()
    assert "if(pixelModulationActive_)" in candidate
    assert "pixelModulationActive_=pixelBass_||pixelMids_||pixelTreble_||pixelBreath_||pixelTransient_;" in candidate
    assert candidate.index("if(pixelModulationActive_)") < candidate.index("// Static chromatic diversity guard")
    assert candidate.index("// Static chromatic diversity guard") < candidate.index("applySceneTint(r,g,b)", candidate.index("// Static chromatic diversity guard"))
    expected, actual = run(BASELINE), run(CANDIDATE)
    assert expected == actual, (expected, actual)
    print("PASS: baseline and candidate are bit-identical for silent and energy-only fast-path states plus active audio, across 5 Vibe profiles, 32 scene IDs, all 512 pixels, and 6 RGB inputs")
    print(f"output_digest={actual}")


if __name__ == "__main__":
    main()
