#pragma once
#include <math.h>
#include <stdint.h>
#include "hbnf_vibe16.h"

namespace hbnf {

struct AudioExpressionSignals {
  float lowEnergy=0.0f, midEnergy=0.0f, highEnergy=0.0f;
  float transient=0.0f, slowEnergy=0.0f;
};

// This layer consumes the one existing Vibe16 analysis result. It performs no FFT,
// does not read WLED audio state, and has no access to clocks or animation state.
class AudioExpression {
 public:
  void reset() {
    low_=mid_=high_=transient_=slow_=noiseFloor_=0.0f;
    refractory_=0.0f; initialized_=false;
  }

  AudioExpressionSignals update(const VibeMetrics& source,float dtSeconds) {
    const float dt=clamp(dtSeconds,0.005f,0.100f);
    const float in[3]={source.silent?0.0f:clamp((source.bassAtt-0.62f)/0.78f,0.0f,1.0f),
                       source.silent?0.0f:clamp((source.midAtt-0.62f)/0.78f,0.0f,1.0f),
                       source.silent?0.0f:clamp((source.trebleAtt-0.62f)/0.78f,0.0f,1.0f)};
    float* env[3]={&low_,&mid_,&high_};
    const float attack[3]={0.075f,0.115f,0.045f};
    const float release[3]={0.48f,0.62f,0.30f};
    if(!initialized_) { low_=in[0];mid_=in[1];high_=in[2];initialized_=true; }
    const float old[3]={low_,mid_,high_};
    for(uint8_t i=0;i<3;i++) smooth(*env[i],in[i],dt,in[i]>*env[i]?attack[i]:release[i]);

    const float novelty=clamp(fmaxf(fmaxf(low_-old[0],mid_-old[1])*1.8f,
                                    (high_-old[2])*1.55f),0.0f,1.0f);
    const float floorTau=novelty>noiseFloor_?0.90f:3.8f;
    smooth(noiseFloor_,novelty,dt,floorTau);
    refractory_=fmaxf(0.0f,refractory_-dt);
    const float threshold=clamp(noiseFloor_*2.2f+0.035f,0.055f,0.24f);
    const bool onset=!source.silent && novelty>threshold && refractory_<=0.0f;
    const float transientTarget=onset?clamp((novelty-threshold)*2.6f,0.0f,0.72f):0.0f;
    const float previousTransient=transient_;
    smooth(transient_,transientTarget,dt,transientTarget>transient_?0.055f:0.24f);
    const float maxTransientStep=dt*5.0f;
    transient_=clamp(transient_,previousTransient-maxTransientStep,previousTransient+maxTransientStep);
    if(onset) refractory_=0.115f;

    const float energyTarget=source.silent?0.0f:clamp(low_*0.45f+mid_*0.38f+high_*0.17f,0.0f,1.0f);
    smooth(slow_,energyTarget,dt,energyTarget>slow_?3.2f:5.5f);
    if(source.silent) {
      smooth(low_,0.0f,dt,0.38f);
      smooth(mid_,0.0f,dt,0.48f);
      smooth(high_,0.0f,dt,0.24f);
      smooth(transient_,0.0f,dt,0.18f);
      smooth(slow_,0.0f,dt,5.5f);
    }
    AudioExpressionSignals out;
    out.lowEnergy=clamp(low_,0.0f,1.0f); out.midEnergy=clamp(mid_,0.0f,1.0f);
    out.highEnergy=clamp(high_,0.0f,1.0f); out.transient=clamp(transient_,0.0f,0.72f);
    out.slowEnergy=clamp(slow_,0.0f,1.0f);
    return out;
  }

 private:
  static float clamp(float x,float lo,float hi) { return !isfinite(x)?lo:(x<lo?lo:(x>hi?hi:x)); }
  static void smooth(float& value,float target,float dt,float tau) {
    const float alpha=1.0f-expf(-dt/tau);
    value+=alpha*(target-value);
  }
  float low_=0.0f,mid_=0.0f,high_=0.0f,transient_=0.0f,slow_=0.0f,noiseFloor_=0.0f,refractory_=0.0f;
  bool initialized_=false;
};

} // namespace hbnf
