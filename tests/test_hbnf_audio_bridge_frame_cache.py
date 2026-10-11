#!/usr/bin/env python3
"""Differentially exercise the pre-frame-cache and cached pinned audio bridge."""

from __future__ import annotations

import hashlib
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OLD = ROOT / "tests/fixtures/hbnf_audio_bridge_pre_frame_cache.h"
NEW = ROOT / "firmware/phase2/integration-r6-cachefix/usermod/hbnf_animartrix_audio_bridge.h"
VIBE16 = ROOT / "firmware/phase2/integration-r6-cachefix/usermod/hbnf_vibe16.h"

HARNESS = r'''#include <cstdint>
#include <cstdio>
struct um_data_t { uint8_t u_size; void **u_data; };
struct UsermodManager { static bool getUMData(um_data_t **, int) { return false; } };
static constexpr int USERMOD_ID_AUDIOREACTIVE=1;
#include "hbnf_animartrix_audio_bridge.h"

int main() {
  const uint8_t amounts[]={0,1,50,100,221,255};
  const uint16_t responses[]={0,1,128,256,512};
  const uint8_t bands[][5]={
    {0,0,0,0,0}, {255,0,0,0,0}, {0,255,0,0,0}, {0,0,255,0,0},
    {96,144,208,64,176}, {20,40,60,80,100}
  };
  uint64_t digest=1469598103934665603ULL;
  const uint8_t dimensions[][2]={{32,16},{31,15},{8,8},{1,1}};
  for(const auto &dimension:dimensions)
    for(uint8_t scene=220;scene<248;scene++)
      for(uint8_t audioCase=0;audioCase<6;audioCase++)
        for(uint8_t amount:amounts)
          for(uint16_t response:responses) {
            const int width=dimension[0],height=dimension[1];
            hbnf::AnimartrixAudioBridge bridge;
            const uint8_t *v=bands[audioCase];
            bridge.beginFrameFromAudio(1000,0,0,amount,response,width,height,scene,
              v[0],v[1],v[2],v[0],v[1],v[2],v[3],v[0],v[1],v[2],v[4],v[3]);
            for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
              const uint8_t colors[][3]={{0,0,0},
                {static_cast<uint8_t>(x*7+y*3),static_cast<uint8_t>(x*2+y*13),static_cast<uint8_t>(255-x*5-y*2)},
                {255,255,255}};
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


def run(header: pathlib.Path, vibe16: pathlib.Path) -> str:
    with tempfile.TemporaryDirectory(prefix="hbnf-audio-cache-") as temp:
        work = pathlib.Path(temp)
        shutil.copy(header, work / "hbnf_animartrix_audio_bridge.h")
        shutil.copy(vibe16, work / "hbnf_vibe16.h")
        source = work / "main.cpp"
        source.write_text(HARNESS)
        binary = work / "bridge-test"
        subprocess.run(
            ["c++", "-std=c++17", "-O2", str(source), "-o", str(binary)],
            cwd=work,
            check=True,
            capture_output=True,
            text=True,
        )
        return subprocess.run(
            [str(binary)], check=True, capture_output=True, text=True
        ).stdout.strip()


def main() -> None:
    if not shutil.which("c++"):
        raise SystemExit("FAIL: a local C++ compiler is required")
    old_digest = hashlib.sha256(OLD.read_bytes()).hexdigest()
    new_digest = hashlib.sha256(NEW.read_bytes()).hexdigest()
    assert old_digest == "56a391336b72bc6f37d835bbe1a6eca1108f3819fd99f5af9816e671ada46351"
    assert new_digest == "b8481f91600e638e2f50f5517206d8f5df5616f83703070e3dea57ea432ca9dc"
    old_pixels = run(OLD, VIBE16)
    new_pixels = run(NEW, VIBE16)
    assert old_pixels == new_pixels, (old_pixels, new_pixels)
    print("PASS: 15,755,040 RGB pixel transforms bit-identical across 28 scenes, 6 audio cases, 6 amounts, 5 response gains, and dimensions 32x16, 31x15, 8x8, 1x1 (including generic radial fallback)")
    print(f"output_digest={new_pixels}")


if __name__ == "__main__":
    main()
