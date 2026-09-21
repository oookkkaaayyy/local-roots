#pragma once
#include <math.h>
#include <stdint.h>

namespace hbnf {

enum VibeProfile : uint8_t { PROFILE_BALANCED=0, PROFILE_BASS=1, PROFILE_MID=2, PROFILE_TREBLE=3, PROFILE_FULL=4, PROFILE_IMPACT=5 };

struct VibeMetrics {
  float bass=1.0f, mid=1.0f, treble=1.0f, overall=1.0f;
  float bassAtt=1.0f, midAtt=1.0f, trebleAtt=1.0f;
  float bassPulse=0.0f, midPulse=0.0f, treblePulse=0.0f;
  float transient=0.0f, pulse=0.0f, energy=0.0f, build=0.0f, impact=0.0f, drop=0.0f;
  bool bassSpike=false, midSpike=false, trebleSpike=false, silent=false;
  float speedFactor=1.0f;
};

class Vibe16 {
 public:
  Vibe16(){ reset(); }
  void reset(){
    for(int i=0;i<3;i++){ avg_[i]=long_[i]=0.0f; rel_[i]=att_[i]=silence_[i]=1.0f; prevSpike_[i]=spike_[i]=false; bandPulse_[i]=0.0f; bandHold_[i]=bandRefractory_[i]=0.0f; }
    frame_=0; speed_=1.0f; pulse_=0.0f; refractory_=hold_=0.0f; energy_=build_=impact_=drop_=0.0f; prevEnergy_=0.0f; dropRefractory_=0.0f;
  }

  VibeMetrics update(const uint8_t fft[16], float volume, float dtSeconds){
    const float dt=clampf(dtSeconds,0.005f,0.100f);
    float imm[3]={ meanBins(fft,0,4), meanBins(fft,4,11), meanBins(fft,11,16) };
    ++frame_;
    if(frame_==1){ for(int i=0;i<3;i++) avg_[i]=long_[i]=imm[i]; }
    else {
      const float fps=1.0f/dt, attack=adjustedRate(0.2f,fps), decay=adjustedRate(0.5f,fps), longRate=adjustedRate(0.992f,fps);
      for(int i=0;i<3;i++){ const float r=(imm[i]>avg_[i])?attack:decay; avg_[i]=avg_[i]*r+imm[i]*(1.0f-r); long_[i]=long_[i]*longRate+avg_[i]*(1.0f-longRate); }
    }
    float fftSum=0.0f; for(int i=0;i<16;i++) fftSum+=fft[i];
    const bool silent=(volume<1.0f && fftSum<12.0f);
    float novelty[3]={0,0,0};
    for(int i=0;i<3;i++){
      const float raw=(long_[i]<0.001f)?1.0f:imm[i]/long_[i];
      const float smoothed=(long_[i]<0.001f)?1.0f:avg_[i]/long_[i];
      if(silent){ const float k=expf(-dt/0.30f); silence_[i]*=k; rel_[i]=raw*silence_[i]; att_[i]=smoothed*silence_[i]; }
      else { silence_[i]=1.0f; rel_[i]=raw; att_[i]=smoothed; }
      novelty[i]=silent?0.0f:clampf(rel_[i]-att_[i],0.0f,0.75f);
      prevSpike_[i]=spike_[i]; spike_[i]=(novelty[i]>0.028f)&&!silent;
      bandRefractory_[i]=fmaxf(0.0f,bandRefractory_[i]-dt); bandHold_[i]=fmaxf(0.0f,bandHold_[i]-dt);
      const bool hit=(novelty[i]>(i==0?0.040f:0.032f)) && bandRefractory_[i]<=0.0f && !silent;
      if(hit){ bandPulse_[i]=fmaxf(bandPulse_[i],clampf(novelty[i]*(i==0?7.5f:(i==1?6.0f:5.0f)),0.0f,1.0f)); bandHold_[i]=0.050f; bandRefractory_[i]=0.100f; }
      else if(bandHold_[i]<=0.0f) bandPulse_[i]*=expf(-dt/(i==0?0.105f:(i==1?0.090f:0.075f)));
      if(silent){ bandHold_[i]=0.0f; bandPulse_[i]*=expf(-dt/0.060f); }
    }

    const float transient=clampf(fmaxf(novelty[0]*9.0f,fmaxf(novelty[1]*5.5f,novelty[2]*3.8f)),0.0f,1.0f);
    refractory_=fmaxf(0.0f,refractory_-dt); hold_=fmaxf(0.0f,hold_-dt);
    const bool qualifiedHit=transient>0.30f && refractory_<=0.0f;
    if(qualifiedHit){ pulse_=fmaxf(pulse_,transient); hold_=0.060f; refractory_=0.120f; }
    else if(hold_<=0.0f) pulse_*=expf(-dt/0.090f);
    if(silent){ hold_=0.0f; pulse_*=expf(-dt/0.070f); }

    const float rawEnergy=silent?0.0f:clampf((att_[0]*0.50f+att_[1]*0.32f+att_[2]*0.18f)-0.88f,0.0f,1.35f);
    const float eTau=(rawEnergy>energy_)?0.080f:0.350f;
    energy_ += (1.0f-expf(-dt/eTau))*(rawEnergy-energy_);
    const float buildTarget=clampf((energy_-0.18f)*0.95f,0.0f,1.0f);
    build_ += (1.0f-expf(-dt/0.85f))*(buildTarget-build_);
    impact_*=expf(-dt/0.150f);
    if(qualifiedHit && energy_>0.22f) impact_=fmaxf(impact_,clampf(0.55f*pulse_+0.45f*energy_+0.25f*build_,0.0f,1.0f));

    dropRefractory_=fmaxf(0.0f,dropRefractory_-dt);
    drop_*=expf(-dt/0.180f);
    const float rise=energy_-prevEnergy_;
    if(!silent && qualifiedHit && build_>0.22f && energy_>0.34f && rise>0.018f && dropRefractory_<=0.0f){
      drop_=1.0f; dropRefractory_=0.60f;
    }
    prevEnergy_=energy_;

    if(silent){ energy_*=expf(-dt/0.10f); build_*=expf(-dt/0.40f); impact_*=expf(-dt/0.08f); drop_*=expf(-dt/0.07f); }

    const float target=profileFactorInternal(PROFILE_BALANCED,silent);
    const float tau=(target>speed_)?0.035f:0.075f;
    speed_ += (1.0f-expf(-dt/tau))*(target-speed_);

    VibeMetrics o;
    o.bass=rel_[0];o.mid=rel_[1];o.treble=rel_[2];o.overall=(rel_[0]+rel_[1]+rel_[2])/3.0f;
    o.bassAtt=att_[0];o.midAtt=att_[1];o.trebleAtt=att_[2];
    o.bassPulse=bandPulse_[0];o.midPulse=bandPulse_[1];o.treblePulse=bandPulse_[2];
    o.bassSpike=spike_[0]&&!prevSpike_[0];o.midSpike=spike_[1]&&!prevSpike_[1];o.trebleSpike=spike_[2]&&!prevSpike_[2];o.silent=silent;
    o.transient=transient;o.pulse=pulse_;o.energy=energy_;o.build=build_;o.impact=impact_;o.drop=drop_;o.speedFactor=speed_;
    return o;
  }

  float profileFactor(VibeProfile p) const { return profileFactorInternal(p,false); }
  float speedFactor() const { return speed_; }

 private:
  float profileFactorInternal(VibeProfile p,bool silent) const {
    if(silent) return 0.10f;
    float f=0.12f;
    switch(p){
      case PROFILE_BASS:   f=0.12f + 3.35f*bandPulse_[0] + 0.45f*bandPulse_[1] + 0.35f*energy_; break;
      case PROFILE_MID:    f=0.14f + 2.85f*bandPulse_[1] + 0.65f*bandPulse_[0] + 0.30f*energy_; break;
      case PROFILE_TREBLE: f=0.18f + 2.65f*bandPulse_[2] + 0.45f*bandPulse_[1] + 0.25f*energy_; break;
      case PROFILE_FULL:   f=0.12f + 1.70f*pulse_ + 0.90f*fmaxf(bandPulse_[0],fmaxf(bandPulse_[1],bandPulse_[2])) + 0.75f*energy_; break;
      case PROFILE_IMPACT: f=0.10f + 1.05f*pulse_ + 1.85f*impact_ + 0.65f*build_ + 0.55f*drop_; break;
      default:             f=0.12f + 2.80f*pulse_; break;
    }
    return clampf(f,0.10f,3.85f);
  }
  static float clampf(float x,float lo,float hi){ return x<lo?lo:(x>hi?hi:x); }
  static float adjustedRate(float rateAt30Fps,float actualFps){ return powf(powf(rateAt30Fps,30.0f),1.0f/actualFps); }
  static float meanBins(const uint8_t fft[16],int begin,int end){ float s=0;for(int i=begin;i<end;i++)s+=fft[i];return s/(float)(end-begin); }
  float avg_[3],long_[3],rel_[3],att_[3],silence_[3],bandPulse_[3],bandHold_[3],bandRefractory_[3];
  bool prevSpike_[3],spike_[3]; uint32_t frame_; float speed_,pulse_,refractory_,hold_,energy_,build_,impact_,drop_,prevEnergy_,dropRefractory_;
};

inline VibeProfile profileFromIntensity(uint8_t intensity){
  if(intensity<43) return PROFILE_BASS;
  if(intensity<86) return PROFILE_MID;
  if(intensity<129) return PROFILE_BALANCED;
  if(intensity<172) return PROFILE_TREBLE;
  if(intensity<215) return PROFILE_FULL;
  return PROFILE_IMPACT;
}

} // namespace hbnf
