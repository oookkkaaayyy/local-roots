#include <cassert>
#include <cstdio>
#include "hbnf_foundation_v1.h"

using namespace hbnf_v1;

int main() {
  // Control mapping must be bounded and monotonic.
  uint16_t prev=0;
  for(int v=0; v<=100; ++v){
    ControlState c;
    c.matrixBrightness=(uint8_t)v;
    c.auxBrightness=(uint8_t)v;
    c.motion=(uint8_t)v;
    c.audioResponse=(uint8_t)v;
    c.variation=(uint8_t)v;
    const auto m=mapControls(c);
    assert(m.matrixScaleQ8>=prev);
    assert(m.auxScaleQ8>=prev);
    assert(m.motionQ8>=prev);
    assert(m.audioDepthQ8>=prev);
    assert(m.variationQ8>=prev);
    prev=m.matrixScaleQ8;
  }
  assert(q8FromPercent(0)==0);
  assert(q8FromPercent(100)==256);

  // WLED 16-band contract -> fixed semantic bands.
  uint8_t fft[16]={0};
  for(int i=0;i<4;i++) fft[i]=200;
  for(int i=4;i<11;i++) fft[i]=100;
  for(int i=11;i<16;i++) fft[i]=50;
  auto a=makeAudioFrame(7,1234,88.4f,fft,true);
  assert(a.sequence==7 && a.timestampMs==1234);
  assert(a.volume==88);
  assert(a.low==200);
  assert(a.mid==100);
  assert(a.high==50);
  assert(a.peak);

  // Identical inputs must be deterministic.
  auto b=makeAudioFrame(7,1234,88.4f,fft,true);
  assert(a.low==b.low && a.mid==b.mid && a.high==b.high && a.volume==b.volume);

  // Audio Response must never reduce modulation for identical audio.
  for(int band=0;band<=255;band+=17){
    uint8_t last=0;
    for(int response=0;response<=100;response++){
      const auto mapped=q8FromPercent((uint8_t)response);
      const auto now=modulatedBand((uint8_t)band,mapped);
      assert(now>=last);
      last=now;
    }
  }

  // Zero output scale is exact black; full scale preserves source.
  for(int value=0;value<=255;value++){
    assert(scale8((uint8_t)value,0)==0);
    assert(scale8((uint8_t)value,256)==(uint8_t)value);
  }

  puts("PASS foundation-v1 core: deterministic WLED audio frame + monotonic direct controls");
  return 0;
}
