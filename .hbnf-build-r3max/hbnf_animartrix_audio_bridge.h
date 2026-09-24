#pragma once
#include <math.h>
#include <stdint.h>
#include "hbnf_vibe16.h"

namespace hbnf {

enum WowStyle : uint8_t { STYLE_CLEAN=0, STYLE_PUNCH=1, STYLE_RING=2, STYLE_SPARK=3, STYLE_CHROMA=4, STYLE_HYBRID=5 };
struct Rgb8 { uint8_t r,g,b; Rgb8(uint8_t rr=0,uint8_t gg=0,uint8_t bb=0):r(rr),g(gg),b(bb){} };

class AnimartrixAudioBridge {
 public:
  AnimartrixAudioBridge(){ reset(); }
  void reset(){
    lastMs_=0; frame_=0; active_=false; width_=32; height_=16; profile_=PROFILE_BALANCED; style_=STYLE_CLEAN; amount_=0; sceneId_=0;
    bass8_=mid8_=treble8_=pulse8_=energy8_=impact8_=drop8_=0; burstLife_=0; burstRadius16_=0; prevImpact8_=0;
    for(auto &s:sparks_){s.life=0;s.x16=s.y16=s.vx16=s.vy16=0;}
    vibe_.reset();
  }

  float beginFrame(float baseSpeed,uint32_t nowMs,uint8_t profileCode,uint8_t styleCode,uint8_t amount,uint16_t width,uint16_t height){
    width_=width?width:1; height_=height?height:1; profile_=profileFromIntensity(profileCode); style_=styleFromCode(styleCode); amount_=amount; ++frame_;
    um_data_t *um=nullptr;
    if(!UsermodManager::getUMData(&um,USERMOD_ID_AUDIOREACTIVE) || !um || um->u_size<3 || !um->u_data || !um->u_data[0] || !um->u_data[2]){
      active_=false; return clampSpeed(baseSpeed);
    }
    float volume=*reinterpret_cast<float*>(um->u_data[0]);
    uint8_t *fft=reinterpret_cast<uint8_t*>(um->u_data[2]);
    float dt=lastMs_?((nowMs-lastMs_)/1000.0f):0.021f; lastMs_=nowMs;
    if(dt<0.005f)dt=0.005f; if(dt>0.100f)dt=0.100f;
    const VibeMetrics m=vibe_.update(fft,volume,dt); active_=true;
    bass8_=unit8(m.bassPulse); mid8_=unit8(m.midPulse); treble8_=unit8(m.treblePulse); pulse8_=unit8(m.pulse);
    energy8_=unit8(m.energy); impact8_=unit8(m.impact); drop8_=unit8(m.drop);
    updateOverlays((uint16_t)(dt*1000.0f+0.5f));
    return clampSpeed(baseSpeed*vibe_.profileFactor(profile_));
  }

  void modulate(int x,int y,uint8_t &r,uint8_t &g,uint8_t &b) const {
    if(!active_ || amount_==0){ applySceneTint(r,g,b); return; }
    const uint16_t musical=(uint16_t)energy8_+(uint16_t)pulse8_;
    const uint8_t extra=(uint8_t)(((uint32_t)amount_*musical*46u)/(255u*510u));
    if(extra){ r=satAdd(r,(uint8_t)(((uint16_t)r*extra)>>8)); g=satAdd(g,(uint8_t)(((uint16_t)g*extra)>>8)); b=satAdd(b,(uint8_t)(((uint16_t)b*extra)>>8)); }

    Rgb8 accent=accentForProfile(profile_);
    uint8_t mix=0;
    const int cx2=(int)width_-1, cy2=(int)height_-1;
    const int dx2=2*x-cx2, dy2=2*y-cy2;
    const int d2=dx2*dx2+dy2*dy2;
    const int maxd2=cx2*cx2+cy2*cy2;

    if(style_==STYLE_PUNCH || style_==STYLE_HYBRID){
      const bool center=d2 < (maxd2*5)/16;
      const uint8_t source=(profile_==PROFILE_BASS?bass8_:(profile_==PROFILE_MID?mid8_:pulse8_));
      if(center) mix=max8(mix,scaledMix(source,86)); else mix=max8(mix,scaledMix(source,28));
    }

    if((style_==STYLE_RING || style_==STYLE_HYBRID) && burstLife_){
      const int radius2=(burstRadius16_*burstRadius16_)>>6;
      int delta=d2-radius2; if(delta<0)delta=-delta;
      const int band=10+(int)(burstLife_>>4);
      if(delta<band) mix=max8(mix,scaledMix(burstLife_,112));
    }

    if(style_==STYLE_CHROMA || style_==STYLE_HYBRID){
      const uint8_t strongest=max8(bass8_,max8(mid8_,treble8_));
      mix=max8(mix,scaledMix(strongest,56));
      if(treble8_>bass8_+24 && treble8_>mid8_+16) accent={160,220,255};
      else if(bass8_>treble8_+20) accent={255,74,28};
      else if(mid8_>bass8_+12) accent={220,255,70};
    }

    if(style_==STYLE_SPARK || style_==STYLE_HYBRID){
      for(const auto &s:sparks_){
        if(!s.life)continue;
        const int px=(s.x16+8)>>4, py=(s.y16+8)>>4, ax=x-px, ay=y-py;
        if(ax*ax+ay*ay<=1){ mix=max8(mix,scaledMix(s.life,164)); accent={255,235,190}; }
      }
      if(treble8_>80){
        const uint8_t h=(uint8_t)((x*29+y*47+(int)(frame_&255u)*13)&255);
        if(h < (uint8_t)(treble8_>>3)){ mix=max8(mix,scaledMix(treble8_,72)); accent={255,255,235}; }
      }
    }

    if(style_!=STYLE_CLEAN){
      const uint8_t hit=max8(impact8_,drop8_);
      if(hit>80){
        const bool cross=(x==(int)(width_/2) || y==(int)(height_/2) || x+y==(int)(width_/2+height_/2));
        if(cross){ mix=max8(mix,scaledMix(hit,118)); accent={255,244,218}; }
      }
    }

    mix=(uint8_t)(((uint16_t)mix*amount_)>>8);
    if(mix){ r=blend8(r,accent.r,mix); g=blend8(g,accent.g,mix); b=blend8(b,accent.b,mix); }

    // Static chromatic diversity guard: several ANIMartRIX looks can naturally settle into
    // blue-dominant frames. Preserve the source animation, but prevent a full-screen blue monopoly
    // with sparse warm complements. The spatial mask is static (not a generic extra animation);
    // music only increases the accent strength.
    if((int)b>(int)r+48 && (int)b>(int)g+36){
      const uint8_t gate=(uint8_t)((x*17+y*31)&7);
      if(gate<=1){
        const bool alt=((x+y)&1)!=0;
        const Rgb8 warm=alt?Rgb8(255,70,165):Rgb8(255,135,45);
        const uint8_t base=(style_==STYLE_CHROMA||style_==STYLE_HYBRID)?40:(style_==STYLE_CLEAN?18:28);
        const uint8_t audio=scaledMix(max8(pulse8_,energy8_),48);
        const uint8_t anti=(uint8_t)(((uint16_t)base+audio)>96?96:((uint16_t)base+audio));
        r=blend8(r,warm.r,anti); g=blend8(g,warm.g,anti); b=blend8(b,warm.b,anti);
      }
    }
    applySceneTint(r,g,b);
  }

  void setScene(uint8_t id) { sceneId_=id; }
  bool active() const { return active_; }
  WowStyle style() const { return style_; }
  VibeProfile profile() const { return profile_; }
  uint8_t amount() const { return amount_; }
  uint8_t bassPulse() const { return bass8_; }
  uint8_t midPulse() const { return mid8_; }
  uint8_t treblePulse() const { return treble8_; }
  uint8_t pulse() const { return pulse8_; }
  uint8_t energy() const { return energy8_; }
  uint8_t impact() const { return impact8_; }
  uint8_t drop() const { return drop8_; }

 private:
  struct Spark { int16_t x16=0,y16=0,vx16=0,vy16=0; uint8_t life=0; };
  Vibe16 vibe_;
  uint32_t lastMs_=0,frame_=0;
  bool active_=false;
  uint16_t width_=32,height_=16;
  uint8_t sceneId_=0;
  VibeProfile profile_=PROFILE_BALANCED;
  WowStyle style_=STYLE_CLEAN;
  uint8_t amount_=0,bass8_=0,mid8_=0,treble8_=0,pulse8_=0,energy8_=0,impact8_=0,drop8_=0;
  uint8_t burstLife_=0,prevImpact8_=0;
  uint16_t burstRadius16_=0;
  Spark sparks_[8];

  static float clampSpeed(float x){ if(!isfinite(x))return 1.0f; return x<0.10f?0.10f:(x>10.0f?10.0f:x); }
  static uint8_t unit8(float x){ if(!isfinite(x)||x<=0.0f)return 0; if(x>=1.0f)return 255; return (uint8_t)(x*255.0f+0.5f); }
  static uint8_t max8(uint8_t a,uint8_t b){return a>b?a:b;}
  static uint8_t satAdd(uint8_t a,uint8_t b){uint16_t x=(uint16_t)a+b;return x>255?255:(uint8_t)x;}
  static uint8_t blend8(uint8_t a,uint8_t b,uint8_t m){return (uint8_t)(((uint16_t)a*(255-m)+(uint16_t)b*m+127)/255);}
  void applySceneTint(uint8_t &r,uint8_t &g,uint8_t &b) const {
    if(sceneId_<220 || sceneId_>247) return;
    static const uint8_t tint[28][3]={
      {75,255,170},{255,190,40},{45,245,220},{185,255,55},{190,110,255},{255,225,55},{45,245,130},
      {245,80,210},{255,120,80},{55,240,205},{170,255,55},{205,155,255},{255,145,35},{70,235,160},
      {255,235,205},{255,95,170},{255,205,45},{65,245,95},{215,110,235},{255,125,25},{100,255,190},
      {255,245,90},{55,235,235},{245,105,190},{115,245,70},{255,130,110},{55,235,185},{255,220,170}
    };
    const uint8_t peak=max8(r,max8(g,b)); if(peak<4) return;
    const uint8_t i=(uint8_t)(sceneId_-220),mix=104;
    const uint8_t tr=(uint8_t)(((uint16_t)tint[i][0]*peak+127)/255);
    const uint8_t tg=(uint8_t)(((uint16_t)tint[i][1]*peak+127)/255);
    const uint8_t tb=(uint8_t)(((uint16_t)tint[i][2]*peak+127)/255);
    r=blend8(r,tr,mix); g=blend8(g,tg,mix); b=blend8(b,tb,mix);
  }
  static uint8_t scaledMix(uint8_t source,uint8_t cap){return (uint8_t)(((uint16_t)source*cap)>>8);}
  static WowStyle styleFromCode(uint8_t v){ if(v<32)return STYLE_CLEAN; if(v<80)return STYLE_PUNCH; if(v<128)return STYLE_RING; if(v<176)return STYLE_SPARK; if(v<224)return STYLE_CHROMA; return STYLE_HYBRID; }
  static Rgb8 accentForProfile(VibeProfile p){
    switch(p){
      case PROFILE_BASS:return{255,70,30};
      case PROFILE_MID:return{215,255,60};
      case PROFILE_TREBLE:return{150,210,255};
      case PROFILE_FULL:return{255,95,190};
      case PROFILE_IMPACT:return{255,220,150};
      default:return{255,130,220};
    }
  }

  void updateOverlays(uint16_t dtMs){
    uint8_t step=(uint8_t)(dtMs<12?1:(dtMs>80?4:(dtMs+10)/20)); if(step<1)step=1;
    if(burstLife_){ uint16_t dec=(uint16_t)step*16; burstLife_=(dec>=burstLife_)?0:(uint8_t)(burstLife_-dec); burstRadius16_+=(uint16_t)step*11; }
    for(auto &s:sparks_){ if(!s.life)continue; s.x16+=(int16_t)(s.vx16*step); s.y16+=(int16_t)(s.vy16*step); uint16_t dec=(uint16_t)step*17; s.life=(dec>=s.life)?0:(uint8_t)(s.life-dec); }
    const uint8_t trigger=max8(impact8_,drop8_);
    if(trigger>150 && prevImpact8_<=150) spawnBurst(trigger);
    prevImpact8_=trigger;
  }

  void spawnBurst(uint8_t strength){
    burstLife_=strength; burstRadius16_=8;
    static const int8_t vx[8]={9,6,0,-6,-9,-6,0,6};
    static const int8_t vy[8]={0,5,8,5,0,-5,-8,-5};
    const int16_t cx=(int16_t)((width_-1)*8),cy=(int16_t)((height_-1)*8);
    const uint8_t rot=(uint8_t)(frame_&7u);
    for(uint8_t i=0;i<8;i++){
      uint8_t k=(uint8_t)((i+rot)&7u); sparks_[i].x16=cx;sparks_[i].y16=cy;sparks_[i].vx16=vx[k];sparks_[i].vy16=vy[k];sparks_[i].life=(uint8_t)(190+(strength>>2));
    }
  }
};

} // namespace hbnf
