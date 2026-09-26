#pragma once
#include <math.h>
#include <stdint.h>

namespace hbnf {

enum MusicVibe : uint8_t { MUSIC_MELLOW=0, MUSIC_MODERATE=1, MUSIC_ENERGETIC=2, MUSIC_PEAK=3 };
struct MusicSemantics {
  float bass, mids, treble, bassAccent, midsAccent, trebleAccent;
  float energy, onset, stableTempoBpm, tempoConfidence, stableTempoBias, confidence;
  MusicVibe vibe;
  bool tempoValid, clipping, onsetEvent;
};

/** Semantic-only audio intelligence. It has no device writes and never changes animation speed. */
class MusicIntelligence {
 public:
  MusicIntelligence() { reset(); }
  void reset() {
    lastMs_=0; floor_=0.035f; energyFast_=energySlow_=0; bassFast_=midFast_=trebleFast_=0;
    bassSlow_=midSlow_=trebleSlow_=centroidSlow_=0; prevEnergy_=onsetPulse_=0; clipFrames_=0; frames_=0;
    for(uint8_t i=0;i<16;i++) prevBins_[i]=0;
    for(uint8_t i=0;i<7;i++) onsetTimes_[i]=0;
    onsetCount_=onsetPos_=0; vibe_=MUSIC_MODERATE; vibeChangedMs_=0; lastOnsetMs_=0;
  }

  MusicSemantics update(const uint8_t fft[16], float volume, uint32_t nowMs, bool hardwareClipping=false) {
    float dt=lastMs_?((uint32_t)(nowMs-lastMs_)/1000.0f):0.020f; lastMs_=nowMs;
    dt=clampf(dt,0.005f,0.250f);
    float bins[16], sum=0, weighted=0, flux=0;
    for(uint8_t i=0;i<16;i++) { bins[i]=fft[i]/255.0f; sum+=bins[i]; weighted+=bins[i]*(i/15.0f); flux+=fmaxf(0,bins[i]-prevBins_[i]); }
    const float energy=clampf(volume/255.0f,0,1), bass=mean(bins,0,4), mids=mean(bins,4,11), treble=mean(bins,11,16);
    const float centroid=sum>0?weighted/sum:0, spectralFlux=flux/16.0f, attack=fmaxf(0,energy-prevEnergy_);
    const float aboveFloor=fmaxf(0,energy-floor_), threshold=fmaxf(0.075f,floor_*1.75f);
    const float onsetStrength=clampf(fmaxf(spectralFlux*1.7f,attack*1.35f),0,1);
    const bool isOnset=aboveFloor>threshold && onsetStrength>0.20f;
    if(energy<fmaxf(0.18f,floor_*2.5f) && spectralFlux<0.055f) floor_=ema(floor_,energy,dt,5.0f);
    else floor_=ema(floor_,fminf(floor_,energy*0.55f),dt,0.6f);
    energyFast_=ema(energyFast_,aboveFloor,dt,0.085f); energySlow_=ema(energySlow_,aboveFloor,dt,1.8f);
    bassFast_=ema(bassFast_,bass,dt,0.095f); midFast_=ema(midFast_,mids,dt,0.095f); trebleFast_=ema(trebleFast_,treble,dt,0.095f);
    bassSlow_=ema(bassSlow_,bass,dt,1.1f); midSlow_=ema(midSlow_,mids,dt,1.1f); trebleSlow_=ema(trebleSlow_,treble,dt,1.1f);
    centroidSlow_=ema(centroidSlow_,centroid,dt,1.5f);
    onsetPulse_=fmaxf(isOnset?onsetStrength:0,onsetPulse_*expf(-dt/0.12f));
    if(isOnset && (!lastOnsetMs_ || (uint32_t)(nowMs-lastOnsetMs_)>=110)) {
      onsetTimes_[onsetPos_]=nowMs; onsetPos_=(uint8_t)((onsetPos_+1)%7); if(onsetCount_<7)onsetCount_++; lastOnsetMs_=nowMs;
    }
    for(uint8_t i=0;i<16;i++)prevBins_[i]=bins[i]; prevEnergy_=energy; frames_++;
    bool clipped=hardwareClipping || energy>=0.985f; uint8_t saturated=0; for(uint8_t i=0;i<16;i++)if(bins[i]>=0.985f)saturated++;
    clipped=clipped || saturated>=5; clipFrames_=clipped?(uint8_t)(clipFrames_<255?clipFrames_+1:255):(clipFrames_?clipFrames_-1:0);
    const bool tempoValid=stableTempo();
    const float dynamics=clampf(fabsf(energyFast_-energySlow_)*2.5f,0,1);
    const float confidence=clampf(0.25f+fminf(0.35f,energySlow_*0.45f)+fminf(0.25f,(tempoValid?0.8f:0)*0.25f)+dynamics*0.15f-(clipFrames_>4?0.22f:0)-(energySlow_<=floor_*1.35f?0.15f:0),0,1);
    const float bpm=tempoValid?tempoBpm_:0;
    const MusicVibe proposed=classify(energySlow_,tempoValid?bpm:0,onsetCount_/7.0f);
    if(proposed!=vibe_ && (uint32_t)(nowMs-vibeChangedMs_)>=1800 && confidence>=0.42f) { vibe_=proposed; vibeChangedMs_=nowMs; }
    const float total=bassSlow_+midSlow_+trebleSlow_;
    MusicSemantics out;
    out.bass=ratio(bassSlow_,total); out.mids=ratio(midSlow_,total); out.treble=ratio(trebleSlow_,total);
    out.bassAccent=bassFast_; out.midsAccent=midFast_; out.trebleAccent=trebleFast_; out.energy=energySlow_;
    out.onset=onsetPulse_; out.stableTempoBpm=bpm; out.tempoConfidence=tempoValid?tempoConfidence_:0;
    out.stableTempoBias=tempoValid?clampf(bpm/118.0f,0.72f,1.42f):1.0f;
    out.confidence=confidence; out.vibe=vibe_; out.tempoValid=tempoValid; out.clipping=clipFrames_>4; out.onsetEvent=isOnset;
    return out;
  }

 private:
  static float clampf(float x,float lo,float hi){return !isfinite(x)?lo:(x<lo?lo:(x>hi?hi:x));}
  static float mean(const float *p,uint8_t a,uint8_t b){float v=0;for(uint8_t i=a;i<b;i++)v+=p[i];return v/(b-a);}
  static float ema(float a,float b,float dt,float tau){float k=1-expf(-dt/tau);return a+k*(b-a);}
  static float ratio(float a,float b){return b>1e-6f?clampf(a/b,0,1):0;}
  static MusicVibe classify(float e,float bpm,float density){
    if(e>0.68f && (bpm==0 || bpm>=118 || density>0.42f))return MUSIC_PEAK;
    if(e>0.48f || bpm>=112 || density>0.35f)return MUSIC_ENERGETIC;
    if(e<0.17f && (bpm==0 || bpm<=92))return MUSIC_MELLOW;
    return MUSIC_MODERATE;
  }
  bool stableTempo(){
    if(onsetCount_<6)return false;
    uint32_t times[7]; for(uint8_t i=0;i<onsetCount_;i++)times[i]=onsetTimes_[(onsetPos_+7-onsetCount_+i)%7];
    float intervals[6],sum=0; for(uint8_t i=1;i<onsetCount_;i++){intervals[i-1]=(float)(times[i]-times[i-1]);sum+=intervals[i-1];}
    const uint8_t n=onsetCount_-1; float avg=sum/n; if(avg<250 || avg>1500)return false;
    float variance=0;uint8_t matching=0; for(uint8_t i=0;i<n;i++){float d=intervals[i]-avg;variance+=d*d;if(fabsf(d)/avg<=0.2f)matching++;}
    float cv=sqrtf(variance/n)/avg; if(cv>0.16f || matching<5)return false;
    tempoBpm_=roundf(60000.0f/avg);tempoConfidence_=clampf((1-cv/0.22f)*(matching/(float)n),0,1);return true;
  }
  uint32_t lastMs_=0,vibeChangedMs_=0,lastOnsetMs_=0,onsetTimes_[7]{};
  float floor_=0.035f,energyFast_=0,energySlow_=0,bassFast_=0,midFast_=0,trebleFast_=0,bassSlow_=0,midSlow_=0,trebleSlow_=0,centroidSlow_=0,prevEnergy_=0,onsetPulse_=0,tempoBpm_=0,tempoConfidence_=0;
  float prevBins_[16]{}; uint8_t clipFrames_=0,frames_=0,onsetCount_=0,onsetPos_=0; MusicVibe vibe_=MUSIC_MODERATE;
};

} // namespace hbnf
