#include <cassert>
#include <cstdio>
#include <cstring>
#include "hbnf_renderer_v1.h"

using namespace hbnf_v1;

static AudioFrame audioWithBand(uint8_t band,uint8_t level,uint32_t t=1000) {
  uint8_t fft[16]={0};
  fft[band]=level;
  return makeAudioFrame(42,t,80.0f,fft,false);
}

static unsigned matrixLevelSum(const RenderFrame& f) {
  unsigned s=0; for(const auto& p:f.matrix) s+=p.level; return s;
}
static unsigned companionLevelSum(const RenderFrame& f) {
  unsigned s=0; for(const auto& p:f.companion) s+=p.level; return s;
}

int main() {
  ControlState c;
  c.matrixBrightness=100;
  c.auxBrightness=100;
  c.audioResponse=100;
  c.motion=50;
  c.variation=100;

  uint8_t fft[16];
  for(int i=0;i<16;i++) fft[i]=(uint8_t)(16+i*14);
  auto a=makeAudioFrame(7,2500,90.0f,fft,true);

  const auto f1=SpectrumRendererV1::render(a,c);
  const auto f2=SpectrumRendererV1::render(a,c);
  assert(std::memcmp(&f1,&f2,sizeof(RenderFrame))==0);
  assert(f1.audioSequence==a.sequence && f1.timestampMs==a.timestampMs);

  // AUX=0 is exact black before any DDP transport.
  c.auxBrightness=0;
  auto off=SpectrumRendererV1::render(a,c);
  for(const auto& p:off.companion) assert(p.level==0);

  // Matrix=0 is exact black independently.
  c.auxBrightness=100; c.matrixBrightness=0;
  auto matrixOff=SpectrumRendererV1::render(a,c);
  for(const auto& p:matrixOff.matrix) assert(p.level==0);
  assert(companionLevelSum(matrixOff)>0);

  // Audio Response is monotonic for identical audio.
  c.matrixBrightness=100;
  unsigned lastM=0,lastA=0;
  for(int response=0;response<=100;response++){
    c.audioResponse=(uint8_t)response;
    auto f=SpectrumRendererV1::render(a,c);
    const unsigned m=matrixLevelSum(f), u=companionLevelSum(f);
    assert(m>=lastM); assert(u>=lastA);
    lastM=m; lastA=u;
  }

  // Motion changes palette phase, never brightness for identical audio/time.
  c.audioResponse=100; c.motion=0; c.variation=100;
  auto still=SpectrumRendererV1::render(a,c);
  c.motion=100;
  auto moving=SpectrumRendererV1::render(a,c);
  assert(matrixLevelSum(still)==matrixLevelSum(moving));
  assert(companionLevelSum(still)==companionLevelSum(moving));
  bool paletteChanged=false;
  for(size_t i=0;i<COMPANION_PIXELS;i++) if(still.companion[i].paletteIndex!=moving.companion[i].paletteIndex) paletteChanged=true;
  assert(paletteChanged);

  // Variation changes palette separation, not brightness.
  c.motion=0;c.variation=0;
  auto coherent=SpectrumRendererV1::render(a,c);
  c.variation=100;
  auto spread=SpectrumRendererV1::render(a,c);
  assert(matrixLevelSum(coherent)==matrixLevelSum(spread));
  assert(companionLevelSum(coherent)==companionLevelSum(spread));
  for(size_t i=1;i<COMPANION_PIXELS;i++) assert(coherent.companion[i].paletteIndex==coherent.companion[0].paletteIndex);
  bool spreadDiff=false;
  for(size_t i=1;i<COMPANION_PIXELS;i++) if(spread.companion[i].paletteIndex!=spread.companion[0].paletteIndex) spreadDiff=true;
  assert(spreadDiff);

  // Low/mid/high isolated inputs occupy distinct portions of both fixtures.
  c.variation=100;c.motion=25;c.audioResponse=100;
  auto low=SpectrumRendererV1::render(audioWithBand(1,255),c);
  auto mid=SpectrumRendererV1::render(audioWithBand(7,255),c);
  auto high=SpectrumRendererV1::render(audioWithBand(14,255),c);
  assert(matrixLevelSum(low)>0 && matrixLevelSum(mid)>0 && matrixLevelSum(high)>0);
  assert(companionLevelSum(low)>0 && companionLevelSum(mid)>0 && companionLevelSum(high)>0);
  assert(std::memcmp(&low,&mid,sizeof(RenderFrame))!=0);
  assert(std::memcmp(&mid,&high,sizeof(RenderFrame))!=0);

  // Companion band mapping must be direct from the same 16 bins.
  for(uint16_t i=0;i<COMPANION_PIXELS;i++){
    const uint8_t band=(uint8_t)(((uint32_t)i*16u)/COMPANION_PIXELS);
    const uint8_t expected=scale8(modulatedBand(a.bins[band],q8FromPercent(c.audioResponse)),q8FromPercent(c.auxBrightness));
    assert(SpectrumRendererV1::render(a,c).companion[i].level==expected);
  }

  puts("PASS renderer-v1 Spectrum: WLED-GEQ-derived, deterministic, monotonic, exact-black companion");
  return 0;
}
