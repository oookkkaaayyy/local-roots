#pragma once

#ifndef HBNF_VIBE_CORE_TYPES_DEFINED
#include "hbnf_foundation_core.h"
#endif
#include <math.h>
#include <stdint.h>

namespace hbnf_v1 {

struct AudioFeatures {
  uint8_t energyShort=0,energyMedium=0,energySlow=0,lowPressure=0;
  uint8_t lowTransient=0,midBody=0,midChange=0,highDetail=0;
  uint8_t highTransient=0,spectralBrightness=0,spectralChange=0;
  uint8_t activity=0,silenceConfidence=255;
};

// This is a reversible runtime adapter over WLED's existing FFT bins and the
// existing Vibe16/AudioExpression envelopes. It does not run another FFT.
struct VibeAudioInput {
  uint8_t fft[16]{};
  float volume=0.0f;
  float bassAtt=0.0f,midAtt=0.0f,trebleAtt=0.0f;
  float bassPulse=0.0f,midPulse=0.0f,treblePulse=0.0f;
  float energy=0.0f,lowEnergy=0.0f,midEnergy=0.0f,highEnergy=0.0f;
  float transient=0.0f,slowEnergy=0.0f;
  bool silent=true;
};

class VibeAudioFeatures {
 public:
  void reset() {
    initialized_=false;midChange_=spectralChange_=0;
    for(uint8_t i=0;i<16;i++)previous_[i]=0;
  }

  AudioFeatures update(const VibeAudioInput& in,uint32_t dtMs) {
    const uint16_t dt=(uint16_t)(dtMs<5u?5u:(dtMs>100u?100u:dtMs));
    uint16_t bandSum[3]={0,0,0};
    for(uint8_t i=0;i<4;i++)bandSum[0]+=in.fft[i];
    for(uint8_t i=4;i<11;i++)bandSum[1]+=in.fft[i];
    for(uint8_t i=11;i<16;i++)bandSum[2]+=in.fft[i];
    const uint8_t band[3]={(uint8_t)(bandSum[0]/4u),(uint8_t)(bandSum[1]/7u),(uint8_t)(bandSum[2]/5u)};
    const uint8_t fast[3]={normalizeEnvelope(in.bassAtt),normalizeEnvelope(in.midAtt),normalizeEnvelope(in.trebleAtt)};
    const uint8_t medium[3]={unit(in.lowEnergy),unit(in.midEnergy),unit(in.highEnergy)};

    AudioFeatures out{};
    out.energyShort=in.silent?0:unit(in.energy);
    out.energyMedium=(uint8_t)(((uint16_t)medium[0]+medium[1]+medium[2])/3u);
    out.energySlow=in.silent?0:unit(in.slowEnergy);
    out.lowPressure=mix(fast[0],medium[0],82,173);
    out.lowTransient=in.silent?0:unit(in.bassPulse);
    out.midBody=mix(fast[1],medium[1],77,178);
    const uint8_t midDelta=absDiff(out.midBody,previousMid_);
    previousMid_=out.midBody;
    midChange_=smooth(midChange_,(uint8_t)min8(255u,(uint16_t)midDelta*5u),dt,180u);
    out.midChange=midChange_;
    out.highDetail=mix(fast[2],band[2],140,115);
    out.highTransient=mix(unit(in.treblePulse),unit(in.transient),166,89);

    uint32_t total=0,weighted=0,delta=0;
    for(uint8_t i=0;i<16;i++) {
      total+=in.fft[i];
      weighted+=(uint32_t)i*in.fft[i];
      if(initialized_)delta+=absDiff(in.fft[i],previous_[i]);
      previous_[i]=in.fft[i];
    }
    initialized_=true;
    out.spectralBrightness=total?(uint8_t)((weighted*255u+(total*7u))/(total*15u)):0;
    const uint8_t rawChange=(uint8_t)min8(255u,(delta*3u+8u)/16u);
    spectralChange_=smooth(spectralChange_,rawChange,dt,120u);
    out.spectralChange=spectralChange_;
    out.activity=out.energyShort>153u?(uint8_t)min8(255u,(uint16_t)out.energyShort*8u/5u):out.energyShort;
    out.activity=max8(out.activity,max8(out.lowTransient,max8(out.midChange,max8(out.highTransient,out.spectralChange))));
    const uint8_t presence=max8(unit(in.volume), (uint8_t)((total+8u)/16u));
    out.silenceConfidence=in.silent?255u:(presence>25u?0u:(uint8_t)(255u-presence*10u));
    return out;
  }

 private:
  static uint8_t unit(float v) { return !isfinite(v)||v<=0?0:(v>=1.0f?255:(uint8_t)(v*255.0f+0.5f)); }
  static uint8_t normalizeEnvelope(float v) { return !isfinite(v)||v<=0.62f?0:(v>=1.40f?255:(uint8_t)(((v-0.62f)*326.9231f)+0.5f)); }
  static uint8_t mix(uint8_t a,uint8_t b,uint8_t wa,uint8_t wb) { return (uint8_t)(((uint16_t)a*wa+(uint16_t)b*wb+127u)/255u); }
  static uint8_t absDiff(uint8_t a,uint8_t b) { return a>b?(uint8_t)(a-b):(uint8_t)(b-a); }
  static uint16_t min8(uint16_t a,uint16_t b) { return a<b?a:b; }
  static uint8_t max8(uint8_t a,uint8_t b) { return a>b?a:b; }
  static uint8_t smooth(uint8_t old,uint8_t target,uint16_t dt,uint16_t tau) {
    const uint16_t alpha=(uint16_t)(((uint32_t)dt*255u)/(tau+dt));
    return (uint8_t)(((uint16_t)old*(255u-alpha)+(uint16_t)target*alpha+127u)/255u);
  }
  uint8_t previous_[16]{};
  uint8_t previousMid_=0,midChange_=0,spectralChange_=0;
  bool initialized_=false;
};

struct AxisWeights { int16_t base; int8_t feature[13]; };

inline uint8_t vibeAxis(const AxisWeights& w,const AudioFeatures& f) {
  const uint8_t values[13]={f.energyShort,f.energyMedium,f.energySlow,f.lowPressure,
    f.lowTransient,f.midBody,f.midChange,f.highDetail,f.highTransient,
    f.spectralBrightness,f.spectralChange,f.activity,f.silenceConfidence};
  int32_t value=w.base;
  for(uint8_t i=0;i<13;i++) value+=((int32_t)values[i]*(int32_t)w.feature[i])/255;
  return (uint8_t)(value<0?0:(value>255?255:value));
}

inline VibeAxes vibeResponse(Vibe vibe,const AudioFeatures& f) {
  // Q8 coefficients are a direct integer encoding of the checked-in provisional
  // response grammar. Each audio dimension remains bounded to 0..255.
  static const AxisWeights w[5][9]={
    {{66,{0,0,0,0,0,0,0,0,0,0,0,0,0}}, {87,{0,38,0,0,0,31,0,0,0,0,0,0,0}}, {107,{0,0,0,51,0,0,0,0,0,0,0,0,0}}, {66,{0,0,0,0,0,0,20,0,0,0,0,0,0}}, {51,{0,0,0,0,0,0,0,31,0,0,0,0,0}}, {51,{0,0,0,0,0,0,0,0,0,0,26,0,0}}, {66,{0,26,0,0,0,0,0,0,0,0,0,0,0}}, {184,{0,0,0,0,0,0,0,0,0,0,-26,0,32}}, {46,{0,0,0,0,0,0,0,0,0,0,26,0,0}}},
    {{97,{0,0,0,38,0,0,0,0,0,0,0,0,0}}, {122,{0,0,0,0,71,0,56,0,0,0,0,51,0}}, {71,{0,0,0,31,0,0,0,0,0,0,0,0,0}}, {56,{0,0,0,0,0,0,26,0,0,0,0,0,0}}, {92,{0,0,0,0,0,0,0,0,51,0,0,0,0}}, {87,{0,0,0,0,0,0,46,0,0,0,0,0,0}}, {122,{0,36,0,0,0,0,0,0,0,0,0,36,0}}, {107,{0,0,0,0,0,0,0,0,0,0,0,-26,0}}, {102,{0,0,0,0,51,0,0,0,0,0,0,0,0}}},
    {{143,{0,0,0,66,77,0,0,0,0,0,0,0,0}}, {61,{0,20,0,0,0,0,0,0,0,0,0,0,0}}, {82,{0,0,0,46,0,0,0,0,0,0,0,0,0}}, {92,{0,0,0,0,31,0,0,0,0,0,0,0,0}}, {66,{0,0,0,0,0,0,0,0,26,0,0,0,0}}, {56,{0,0,0,0,0,0,0,0,0,0,20,0,0}}, {158,{0,0,0,0,0,0,0,0,0,0,0,0,0}}, {77,{0,0,0,-20,0,0,0,0,0,0,0,0,0}}, {122,{0,0,0,0,77,0,0,0,0,0,0,0,0}}},
    {{87,{0,0,0,0,0,0,46,0,0,0,0,0,0}}, {87,{0,0,0,0,0,0,0,0,0,0,51,0,0}}, {97,{0,0,0,0,0,0,0,0,0,36,0,0,0}}, {148,{0,0,0,0,0,0,66,0,0,0,56,0,0}}, {133,{0,0,0,0,0,0,0,56,0,0,0,0,0}}, {163,{0,0,0,0,0,0,0,0,0,31,56,0,0}}, {117,{0,0,0,0,0,0,0,0,0,0,0,31,0}}, {97,{0,0,0,0,0,0,0,0,0,0,0,-20,0}}, {128,{0,0,0,0,0,0,0,0,0,0,61,0,0}}},
    {{77,{0,0,0,0,0,31,0,0,0,0,0,0,0}}, {61,{0,0,31,0,0,0,0,0,0,0,0,0,0}}, {168,{0,0,0,61,0,0,0,0,0,0,0,0,36}}, {87,{0,0,0,0,0,0,20,0,0,0,0,0,0}}, {117,{0,0,0,0,0,0,0,61,31,0,0,0,0}}, {97,{0,0,0,0,0,0,0,0,0,46,0,0,0}}, {77,{0,26,0,0,0,0,0,0,0,0,0,0,0}}, {168,{0,0,0,0,0,0,0,0,0,0,0,-26,0}}, {77,{0,0,0,0,0,0,0,0,0,0,31,0,0}}}
  };
  const uint8_t v=(uint8_t)vibe<5u?(uint8_t)vibe:0u;
  VibeAxes out{};
  out.structure=vibeAxis(w[v][0],f);out.flow=vibeAxis(w[v][1],f);
  out.depth=vibeAxis(w[v][2],f);out.symmetry=vibeAxis(w[v][3],f);
  out.detail=vibeAxis(w[v][4],f);out.paletteMotion=vibeAxis(w[v][5],f);
  out.density=vibeAxis(w[v][6],f);out.negativeSpace=vibeAxis(w[v][7],f);
  out.transitionEnergy=vibeAxis(w[v][8],f);
  return out;
}

// Reversible palette/composition defaults over the existing donor frame.
// This bounded integer pass keeps the native renderer and continuous motion.
inline Rgb8 composeVibeColor(Rgb8 c,const CanonicalFrame& f,uint16_t x,uint16_t y) {
  if(!(c.r|c.g|c.b))return c;
  const VibeAxes& a=f.vibeAxes;
  const uint8_t t=(uint8_t)(f.phaseQ16>>8);
  switch(f.vibe){
    case VIBE_GROOVE: {
      const uint8_t pulse=f.audio.midPulse>f.audio.bassPulse?f.audio.midPulse:f.audio.bassPulse;
      const uint8_t weave=(uint8_t)((x*11u+y*7u+t/3u)&63u);
      c=blend(c,Rgb8(c.g,c.b,c.r),(uint8_t)(30u+weave/3u+pulse/5u));
      const uint8_t lift=(uint8_t)(188u+(uint16_t)a.flow*45u/255u+(uint16_t)pulse*22u/255u);
      return scaleRgb(c,lift);
    }
    case VIBE_HEAVY: {
      const uint8_t pulse=f.audio.bassPulse;
      const uint8_t pressure=(uint8_t)(168u+(uint16_t)a.structure*55u/255u+(uint16_t)pulse*32u/255u);
      c=scaleRgb(c,pressure);
      if(((x+y+(t>>4))&7u)==0)c=blend(c,Rgb8(255,74,26),(uint8_t)(a.density/6u));
      return c;
    }
    case VIBE_PSYCHEDELIC: {
      const uint8_t wave=(uint8_t)((x*17u+y*29u+t+(uint16_t)f.audio.transient/2u)&255u);
      const uint8_t mix=(uint8_t)(24u+(uint16_t)a.paletteMotion/4u+(uint16_t)f.audio.highEnergy/5u);
      const Rgb8 shifted=(wave&128u)?Rgb8(c.g,c.b,c.r):Rgb8(c.b,c.r,c.g);
      return blend(c,shifted,mix);
    }
    case VIBE_COSMIC: {
      const uint8_t drift=(uint8_t)((t/24u)+(uint16_t)f.audio.slowEnergy/5u+(x*3u+y*5u)/4u);
      if(drift&32u)c=blend(c,Rgb8(c.g,c.r,c.b),32u);
      const uint8_t shade=(uint8_t)(174u+(uint16_t)a.depth*42u/255u+(uint16_t)f.audio.slowEnergy*23u/255u);
      c=scaleRgb(c,shade);
      return blend(c,Rgb8(44,72,190),(uint8_t)(a.negativeSpace/7u));
    }
    case VIBE_CHILL:
    default: {
      const uint8_t shade=(uint8_t)(184u+(uint16_t)a.depth*45u/255u+(uint16_t)f.audio.slowEnergy*18u/255u);
      return scaleRgb(blend(c,Rgb8(c.g,c.b,c.r),a.paletteMotion/8u),shade);
    }
  }
}

class AutoVibeSelector {
 public:
  void reset(uint32_t now=0) { current_=VIBE_CHILL;lastSwitchMs_=now; }
  Vibe update(const AudioFeatures& f,uint32_t now) {
    if((uint32_t)(now-lastSwitchMs_)<45000u)return current_;
    const uint8_t s[5]={
      (uint8_t)(((uint16_t)f.silenceConfidence*140u+(uint16_t)(255u-f.activity)*77u+(uint16_t)f.energySlow*38u)/255u),
      (uint8_t)(((uint16_t)f.midChange*115u+(uint16_t)f.lowTransient*89u+(uint16_t)f.activity*51u)/255u),
      (uint8_t)(((uint16_t)f.lowPressure*128u+(uint16_t)f.lowTransient*89u+(uint16_t)f.energyMedium*38u)/255u),
      (uint8_t)(((uint16_t)f.spectralChange*115u+(uint16_t)f.midChange*77u+(uint16_t)f.spectralBrightness*64u)/255u),
      (uint8_t)(((uint16_t)f.energySlow*102u+(uint16_t)f.highDetail*77u+(uint16_t)(255u-f.activity)*77u)/255u)
    };
    uint8_t challenger=0;
    for(uint8_t i=1;i<5;i++)if(s[i]>s[challenger])challenger=i;
    if(challenger!=(uint8_t)current_ && (uint16_t)s[challenger]>=(uint16_t)s[(uint8_t)current_]+31u){
      current_=(Vibe)challenger;lastSwitchMs_=now;
    }
    return current_;
  }
  Vibe current() const { return current_; }
 private:
  Vibe current_=VIBE_CHILL;
  uint32_t lastSwitchMs_=0;
};

inline uint8_t vibeProfileCode(Vibe vibe) {
  static const uint8_t code[5]={24,112,240,202,104};
  return code[(uint8_t)vibe<5u?(uint8_t)vibe:0u];
}
inline uint8_t vibeStyleCode(Vibe vibe) {
  static const uint8_t code[5]={24,104,64,204,24};
  return code[(uint8_t)vibe<5u?(uint8_t)vibe:0u];
}

} // namespace hbnf_v1
