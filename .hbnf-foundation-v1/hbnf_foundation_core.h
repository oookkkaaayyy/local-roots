#pragma once
#include <stdint.h>
#include <stddef.h>

namespace hbnf_v1 {

struct Rgb8 { uint8_t r=0,g=0,b=0; };

enum Scene : uint8_t {
  COURSE_FLOW=0,
  FIELD_MIX=1,
  SIGNATURE=2,
  QUIET_COSMOS=3
};

struct Controls {
  // Literal semantic controls. No categorical remapping.
  uint8_t audioResponse=50; // 0 = no audio modulation, 50 = 1.0x, 100 = 2.0x
  uint8_t motion=50;        // 0 = 0.5x, 50 = 1.0x, 100 = 1.5x
  uint16_t evolutionMs=12000;
  uint8_t matrixBrightness=24;
  uint8_t auxBrightness=180;
  uint8_t micGain=60;
  uint8_t squelch=10;
  Scene scene=COURSE_FLOW;
};

struct AudioFrame {
  // Inputs are the already-processed WLED AudioReactive values.
  uint8_t bass=0;
  uint8_t mid=0;
  uint8_t treble=0;
  uint8_t volume=0;
  bool peak=false;
};

struct CanonicalFrame {
  uint32_t frame=0;
  uint32_t phaseQ16=0;
  uint32_t structuralEpoch=0;
  Controls controls{};
  AudioFrame audio{};
  Rgb8 palette[4]{};
};

inline uint16_t audioGainQ8(uint8_t response){
  // exact linear mapping: 0..100 -> 0.0x..2.0x
  return (uint16_t)(((uint32_t)response * 512u + 50u) / 100u);
}

inline uint16_t motionQ8(uint8_t motion){
  // exact linear mapping: 0..100 -> 0.5x..1.5x
  return (uint16_t)(128u + ((uint32_t)motion * 256u + 50u) / 100u);
}

inline uint8_t scaleAudio(uint8_t v,uint8_t response){
  const uint32_t x=(uint32_t)v*audioGainQ8(response);
  const uint32_t y=(x+128u)>>8;
  return (uint8_t)(y>255u?255u:y);
}

inline uint8_t scale8(uint8_t v,uint8_t gain){
  return (uint8_t)(((uint16_t)v*(uint16_t)gain+127u)/255u);
}

inline uint8_t blend8(uint8_t a,uint8_t b,uint8_t mix){
  return (uint8_t)(((uint16_t)a*(255u-mix)+(uint16_t)b*mix+127u)/255u);
}

inline Rgb8 blend(Rgb8 a,Rgb8 b,uint8_t mix){
  return {blend8(a.r,b.r,mix),blend8(a.g,b.g,mix),blend8(a.b,b.b,mix)};
}

inline Rgb8 paletteAt(const CanonicalFrame& f,uint16_t posQ16){
  const uint8_t slot=(uint8_t)(posQ16>>14); // 0..3
  const uint8_t next=(uint8_t)((slot+1u)&3u);
  const uint8_t frac=(uint8_t)((posQ16>>6)&255u);
  return blend(f.palette[slot],f.palette[next],frac);
}

inline void defaultPalette(Scene s,Rgb8 out[4]){
  switch(s){
    case FIELD_MIX:
      out[0]={255,54,28}; out[1]={255,190,28}; out[2]={26,230,170}; out[3]={30,120,255}; break;
    case SIGNATURE:
      out[0]={255,40,160}; out[1]={130,50,255}; out[2]={35,220,255}; out[3]={255,180,35}; break;
    case QUIET_COSMOS:
      out[0]={20,30,90}; out[1]={65,40,150}; out[2]={20,130,170}; out[3]={120,65,180}; break;
    default:
      out[0]={20,210,170}; out[1]={40,110,255}; out[2]={180,55,255}; out[3]={255,95,80}; break;
  }
}

inline CanonicalFrame makeFrame(uint32_t frame,uint32_t phaseQ16,uint32_t structuralEpoch,const Controls& c,const AudioFrame& a){
  CanonicalFrame f;
  f.frame=frame; f.phaseQ16=phaseQ16; f.structuralEpoch=structuralEpoch;
  f.controls=c; f.audio=a; defaultPalette(c.scene,f.palette);
  return f;
}

inline Rgb8 applyAudio(const CanonicalFrame& f,Rgb8 src,uint8_t position){
  // Use direct WLED AudioReactive bands. No long-term adaptive baseline.
  const uint8_t bass=scaleAudio(f.audio.bass,f.controls.audioResponse);
  const uint8_t mid=scaleAudio(f.audio.mid,f.controls.audioResponse);
  const uint8_t high=scaleAudio(f.audio.treble,f.controls.audioResponse);

  // bass: luminance/body
  const uint8_t bassMix=(uint8_t)(((uint16_t)bass*96u)>>8);
  src.r=(uint8_t)(src.r + (((255u-src.r)*bassMix)>>8));
  src.g=(uint8_t)(src.g + (((255u-src.g)*bassMix)>>8));
  src.b=(uint8_t)(src.b + (((255u-src.b)*bassMix)>>8));

  // mids: palette morph; never invent a separate palette
  const uint8_t midMix=(uint8_t)(((uint16_t)mid*112u)>>8);
  if(midMix){
    const Rgb8 target=f.palette[(position+1u)&3u];
    src=blend(src,target,midMix);
  }

  // highs: crisp local accent, bounded and deterministic
  if(high && (((uint16_t)position*37u + (uint16_t)(f.frame&255u)*11u)&255u) < (high>>1)){
    const uint8_t lift=(uint8_t)(((uint16_t)high*72u)>>8);
    src=blend(src,{255,255,255},lift);
  }
  return src;
}

inline void renderAux22(const CanonicalFrame& f,Rgb8 out[22]){
  // Cart geometry order: 5 + 6 + 5 + 6 around the perimeter.
  // Same phase/palette/audio as Matrix; geometry only changes spatial sampling.
  const uint16_t motion=motionQ8(f.controls.motion);
  const uint32_t phase=(uint32_t)(((uint64_t)f.phaseQ16*motion)>>8);
  for(uint8_t i=0;i<22;i++){
    const uint16_t p=(uint16_t)(phase + (uint32_t)i*(65536u/22u));
    Rgb8 c=paletteAt(f,p);
    c=applyAudio(f,c,(uint8_t)(i&3u));
    out[i]=scale8(c,f.controls.auxBrightness);
  }
}

} // namespace hbnf_v1
