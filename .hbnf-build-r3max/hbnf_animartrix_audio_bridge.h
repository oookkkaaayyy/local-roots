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
    lastMs_=0; frame_=0; active_=false; width_=32; height_=16;
    profile_=PROFILE_BALANCED; style_=STYLE_CLEAN; amount_=0; sceneId_=0; variantCode_=0; variantSalt_=0; domainCode_=0;
    bass8_=mid8_=treble8_=pulse8_=energy8_=impact8_=drop8_=0;
    bassBody8_=midBody8_=trebleBody8_=0;
    bassLane8_=midLane8_=trebleLane8_=budget8_=0;
    focusBand_=255; focusLifeMs_=0; prevImpact8_=0;
    vibe_.reset();
  }

  float beginFrame(float baseSpeed,uint32_t nowMs,uint8_t profileCode,uint8_t styleCode,uint8_t amount,uint16_t width,uint16_t height,uint8_t variantCode=0,uint8_t variantSalt=0){
    width_=width?width:1; height_=height?height:1;
    profile_=profileFromIntensity(profileCode);
    style_=styleFromCode(styleCode);
    amount_=amount;
    variantCode_=variantCode;
    variantSalt_=variantSalt;
    domainCode_=(uint8_t)((variantCode_>>3)&3u);
    ++frame_;

    um_data_t *um=nullptr;
    if(!UsermodManager::getUMData(&um,USERMOD_ID_AUDIOREACTIVE) || !um || um->u_size<3 || !um->u_data || !um->u_data[0] || !um->u_data[2]){
      active_=false;
      bassLane8_=midLane8_=trebleLane8_=budget8_=0;
      return clampSpeed(baseSpeed);
    }

    float volume=*reinterpret_cast<float*>(um->u_data[0]);
    uint8_t *fft=reinterpret_cast<uint8_t*>(um->u_data[2]);
    float dt=lastMs_?((nowMs-lastMs_)/1000.0f):0.021f;
    lastMs_=nowMs;
    if(dt<0.005f)dt=0.005f;
    if(dt>0.100f)dt=0.100f;

    const VibeMetrics m=vibe_.update(fft,volume,dt);
    active_=true;

    bass8_=unit8(m.bassPulse);
    mid8_=unit8(m.midPulse);
    treble8_=unit8(m.treblePulse);
    pulse8_=unit8(m.pulse);
    energy8_=unit8(m.energy);
    impact8_=unit8(m.impact);
    drop8_=unit8(m.drop);

    // Continuous texture lanes make quieter musical detail matter. These are normalized
    // relative-band envelopes, not raw mic volume, so they complement transient pulses.
    bassBody8_=body8(m.bassAtt);
    midBody8_=body8(m.midAtt);
    trebleBody8_=body8(m.trebleAtt);

    updateLaneMix((uint16_t)(dt*1000.0f+0.5f));

    // Audio never owns global animation tempo.
    return clampSpeed(baseSpeed);
  }

  void modulate(int x,int y,uint8_t &r,uint8_t &g,uint8_t &b) const {
    if(!active_ || amount_==0){
      applySceneTint(r,g,b);
      return;
    }

    const uint8_t srcPeak=max8(r,max8(g,b));
    const uint8_t effectKey=(sceneId_>=220&&sceneId_<=247)?(uint8_t)(sceneId_-220):sceneId_;
    const uint8_t sceneKey=(uint8_t)(effectKey*17u + variantSalt_*13u + domainCode_*29u);

    // One bounded response budget is shared by bass/mid/treble. Simultaneous bands
    // interact instead of stacking three independent overlays and overwhelming the frame.
    const uint8_t bass=(uint8_t)(((uint16_t)bassLane8_*amount_)>>8);
    const uint8_t mids=(uint8_t)(((uint16_t)midLane8_*amount_)>>8);
    const uint8_t treble=(uint8_t)(((uint16_t)trebleLane8_*amount_)>>8);

    // Slow energy breath only; transients are deliberately excluded from this global term.
    const uint8_t breath=(uint8_t)(((uint16_t)scaledMix(energy8_,22)*amount_)>>8);
    if(breath && srcPeak){
      r=satAdd(r,(uint8_t)(((uint16_t)r*breath)>>8));
      g=satAdd(g,(uint8_t)(((uint16_t)g*breath)>>8));
      b=satAdd(b,(uint8_t)(((uint16_t)b*breath)>>8));
    }

    const int cx2=(int)width_-1, cy2=(int)height_-1;
    const int dx2=2*x-cx2, dy2=2*y-cy2;
    const int d2=dx2*dx2+dy2*dy2;
    const int maxd2=cx2*cx2+cy2*cy2;

    // LOW lane: pressure/thump by scaling the existing image. No new glyph is painted.
    // Scene seed varies whether the pressure blooms from the center or compresses from edges.
    if(bass && srcPeak>3){
      uint8_t mask=255;
      if(maxd2>0){
        const int radial=(int)(((int64_t)d2*159)/maxd2);
        mask=(sceneKey&1u)?(uint8_t)(96+radial):(uint8_t)(255-radial);
      }
      const uint8_t gain=(uint8_t)(((uint16_t)bass*mask)>>8);
      r=satAdd(r,(uint8_t)(((uint16_t)r*gain)>>7));
      g=satAdd(g,(uint8_t)(((uint16_t)g*gain)>>7));
      b=satAdd(b,(uint8_t)(((uint16_t)b*gain)>>7));
    }

    // MID lane: morph the colors already present in the animation with a moving,
    // scene-seeded field. This changes the animation's body instead of drawing an impulse.
    if(mids && srcPeak>3){
      const uint8_t phase=(uint8_t)((x*11+y*7+(int)(frame_>>1)+sceneKey*13u)&31);
      const uint8_t tri=phase<16?phase:(uint8_t)(31-phase);
      const uint8_t field=(uint8_t)(96+tri*10); // 96..246
      const uint8_t mm=(uint8_t)(((uint16_t)mids*field)>>9); // bounded source-coupled morph
      if(mm){
        const uint8_t rr=r,gg=g,bb=b;
        if(sceneKey&2u){
          r=blend8(rr,bb,mm); g=blend8(gg,rr,mm); b=blend8(bb,gg,mm);
        } else {
          r=blend8(rr,gg,mm); g=blend8(gg,bb,mm); b=blend8(bb,rr,mm);
        }
      }
    }

    // HIGH lane: make existing bright detail dance. Dark/background pixels stay dark,
    // so treble cannot become a competing overlay on top of the base animation.
    if(treble && srcPeak>18){
      const uint8_t gate=(uint8_t)((x*29+y*47+(int)(frame_&255u)*13+sceneKey*17u)&255);
      const uint8_t threshold=(uint8_t)(20+(treble>>1));
      if(gate<threshold){
        const uint8_t gain=scaledMix(treble,118);
        r=satAdd(r,(uint8_t)(((uint16_t)r*gain)>>7));
        g=satAdd(g,(uint8_t)(((uint16_t)g*gain)>>7));
        b=satAdd(b,(uint8_t)(((uint16_t)b*gain)>>7));
        const uint8_t sparkle=scaledMix(treble,34);
        r=blend8(r,255,sparkle); g=blend8(g,248,sparkle); b=blend8(b,238,sparkle);
      }
    }

    // Static chromatic diversity guard from the accepted baseline. Audio may strengthen
    // it gently through energy, but transient hits cannot turn it into another impulse.
    if((int)b>(int)r+48 && (int)b>(int)g+36){
      const uint8_t gate=(uint8_t)((x*17+y*31)&7);
      if(gate<=1){
        const bool alt=((x+y)&1)!=0;
        const Rgb8 warm=alt?Rgb8(255,70,165):Rgb8(255,135,45);
        const uint8_t base=(style_==STYLE_CHROMA||style_==STYLE_HYBRID)?40:(style_==STYLE_CLEAN?18:28);
        const uint8_t audio=scaledMix(energy8_,24);
        const uint8_t anti=(uint8_t)(((uint16_t)base+audio)>80?80:((uint16_t)base+audio));
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
  uint8_t domain() const { return domainCode_; }
  uint8_t variantCode() const { return variantCode_; }
  uint8_t variantSalt() const { return variantSalt_; }
  uint8_t bassPulse() const { return bass8_; }
  uint8_t midPulse() const { return mid8_; }
  uint8_t treblePulse() const { return treble8_; }
  uint8_t pulse() const { return pulse8_; }
  uint8_t energy() const { return energy8_; }
  uint8_t impact() const { return impact8_; }
  uint8_t drop() const { return drop8_; }

 private:
  Vibe16 vibe_;
  uint32_t lastMs_=0,frame_=0;
  bool active_=false;
  uint16_t width_=32,height_=16;
  uint8_t sceneId_=0,variantCode_=0,variantSalt_=0,domainCode_=0;
  VibeProfile profile_=PROFILE_BALANCED;
  WowStyle style_=STYLE_CLEAN;
  uint8_t amount_=0;

  uint8_t bass8_=0,mid8_=0,treble8_=0,pulse8_=0,energy8_=0,impact8_=0,drop8_=0;
  uint8_t bassBody8_=0,midBody8_=0,trebleBody8_=0;
  uint8_t bassLane8_=0,midLane8_=0,trebleLane8_=0,budget8_=0;
  uint8_t focusBand_=255,prevImpact8_=0;
  uint16_t focusLifeMs_=0;

  static float clampSpeed(float x){ if(!isfinite(x))return 1.0f; return x<0.10f?0.10f:(x>10.0f?10.0f:x); }
  static uint8_t unit8(float x){ if(!isfinite(x)||x<=0.0f)return 0; if(x>=1.0f)return 255; return (uint8_t)(x*255.0f+0.5f); }
  static uint8_t body8(float x){
    if(!isfinite(x)||x<=0.88f)return 0;
    return unit8((x-0.88f)/0.72f);
  }
  static uint8_t max8(uint8_t a,uint8_t b){return a>b?a:b;}
  static uint8_t satAdd(uint8_t a,uint8_t b){uint16_t x=(uint16_t)a+b;return x>255?255:(uint8_t)x;}
  static uint8_t blend8(uint8_t a,uint8_t b,uint8_t m){return (uint8_t)(((uint16_t)a*(255-m)+(uint16_t)b*m+127)/255);}
  static uint8_t scaledMix(uint8_t source,uint8_t cap){return (uint8_t)(((uint16_t)source*cap)>>8);}
  static uint8_t scale8(uint8_t v,uint16_t scale){uint16_t x=((uint16_t)v*scale)>>8;return x>255?255:(uint8_t)x;}

  void applySceneTint(uint8_t &r,uint8_t &g,uint8_t &b) const {
    if(sceneId_<220 || sceneId_>247) return;
    static const uint8_t tint[28][3]={
      {75,255,170},{255,190,40},{45,245,220},{185,255,55},{190,110,255},{255,225,55},{45,245,130},
      {245,80,210},{255,120,80},{55,240,205},{170,255,55},{205,155,255},{255,145,35},{70,235,160},
      {255,235,205},{255,95,170},{255,205,45},{65,245,95},{215,110,235},{255,125,25},{100,255,190},
      {255,245,90},{55,235,235},{245,105,190},{115,245,70},{255,130,110},{55,235,185},{255,220,170}
    };
    const uint8_t peak=max8(r,max8(g,b)); if(peak<4) return;
    const uint8_t base=(uint8_t)(sceneId_-220);
    const uint8_t i=(uint8_t)((base + (uint8_t)(variantSalt_*5u) + (uint8_t)(domainCode_*7u)) % 28u);
    const uint8_t mix=domainCode_==2?132:(domainCode_==1?116:(domainCode_==3?104:96));
    const uint8_t tr=(uint8_t)(((uint16_t)tint[i][0]*peak+127)/255);
    const uint8_t tg=(uint8_t)(((uint16_t)tint[i][1]*peak+127)/255);
    const uint8_t tb=(uint8_t)(((uint16_t)tint[i][2]*peak+127)/255);
    r=blend8(r,tr,mix); g=blend8(g,tg,mix); b=blend8(b,tb,mix);
  }

  static WowStyle styleFromCode(uint8_t v){
    if(v<32)return STYLE_CLEAN; if(v<80)return STYLE_PUNCH; if(v<128)return STYLE_RING;
    if(v<176)return STYLE_SPARK; if(v<224)return STYLE_CHROMA; return STYLE_HYBRID;
  }

  void updateLaneMix(uint16_t dtMs){
    if(focusLifeMs_>dtMs) focusLifeMs_-=dtMs; else { focusLifeMs_=0; focusBand_=255; }

    uint8_t d[3]={
      max8(bass8_,scaledMix(bassBody8_,192)),
      max8(mid8_,scaledMix(midBody8_,192)),
      max8(treble8_,scaledMix(trebleBody8_,192))
    };

    // User-selected emphasis remains meaningful, but never turns other bands off.
    switch(profile_){
      case PROFILE_BASS:   d[0]=scale8(d[0],300); d[1]=scale8(d[1],190); d[2]=scale8(d[2],170); break;
      case PROFILE_MID:    d[0]=scale8(d[0],190); d[1]=scale8(d[1],300); d[2]=scale8(d[2],190); break;
      case PROFILE_TREBLE: d[0]=scale8(d[0],170); d[1]=scale8(d[1],190); d[2]=scale8(d[2],300); break;
      case PROFILE_FULL:   d[0]=scale8(d[0],268); d[1]=scale8(d[1],268); d[2]=scale8(d[2],268); break;
      case PROFILE_IMPACT: d[0]=scale8(d[0],244); d[1]=scale8(d[1],244); d[2]=scale8(d[2],244); break;
      default:             d[0]=scale8(d[0],230); d[1]=scale8(d[1],230); d[2]=scale8(d[2],230); break;
    }

    // Reaction style changes weighting, not geometry overlays.
    switch(style_){
      case STYLE_CLEAN:  d[0]=scale8(d[0],170); d[1]=scale8(d[1],170); d[2]=scale8(d[2],170); break;
      case STYLE_PUNCH:  d[0]=scale8(d[0],300); d[1]=scale8(d[1],205); d[2]=scale8(d[2],180); break;
      case STYLE_RING:   d[0]=scale8(d[0],205); d[1]=scale8(d[1],286); d[2]=scale8(d[2],205); break;
      case STYLE_SPARK:  d[0]=scale8(d[0],185); d[1]=scale8(d[1],205); d[2]=scale8(d[2],300); break;
      case STYLE_CHROMA: d[0]=scale8(d[0],205); d[1]=scale8(d[1],270); d[2]=scale8(d[2],270); break;
      default:           d[0]=scale8(d[0],250); d[1]=scale8(d[1],250); d[2]=scale8(d[2],250); break;
    }

    // Every named scene uses the same source-coupled audio engine. The domain only
    // biases emphasis, so low/mid/high remain present and semantically distinct.
    switch(domainCode_){
      case 1: d[0]=scale8(d[0],286); d[1]=scale8(d[1],264); d[2]=scale8(d[2],222); break; // Field Mix
      case 2: d[0]=scale8(d[0],224); d[1]=scale8(d[1],278); d[2]=scale8(d[2],286); break; // Signature
      case 3: d[0]=scale8(d[0],190); d[1]=scale8(d[1],244); d[2]=scale8(d[2],304); break; // Quiet Cosmos
      default: break; // Course Flow
    }

    const uint8_t hit=max8(impact8_,drop8_);
    if(hit>80 && prevImpact8_<=80){
      focusBand_=(d[0]>=d[1]&&d[0]>=d[2])?0:((d[1]>=d[2])?1:2);
      focusLifeMs_=150;
    }
    prevImpact8_=hit;

    // A hard transient grants priority to its dominant band for ~150ms. Other lanes remain
    // present but subdued, preventing clap/kick/cymbal reactions from becoming three competing impulses.
    if(focusLifeMs_ && focusBand_<3){
      for(uint8_t i=0;i<3;i++) d[i]=scale8(d[i],i==focusBand_?330:150);
      if(d[focusBand_]<hit) d[focusBand_]=hit;
    }

    const uint16_t sum=(uint16_t)d[0]+d[1]+d[2];
    const uint8_t peak=max8(d[0],max8(d[1],d[2]));
    const uint8_t energyFloor=scaledMix(energy8_,156);
    budget8_=max8(peak,energyFloor);

    if(sum==0 || budget8_==0){
      bassLane8_=midLane8_=trebleLane8_=0;
      return;
    }

    // Shared budget: three active bands divide one bounded amount of visual influence.
    bassLane8_=(uint8_t)(((uint32_t)budget8_*d[0])/sum);
    midLane8_=(uint8_t)(((uint32_t)budget8_*d[1])/sum);
    trebleLane8_=(uint8_t)(((uint32_t)budget8_*d[2])/sum);

    // Keep genuinely quiet detail from disappearing after integer division.
    if(d[0]>16 && bassLane8_<6) bassLane8_=6;
    if(d[1]>16 && midLane8_<6) midLane8_=6;
    if(d[2]>16 && trebleLane8_<6) trebleLane8_=6;
  }
};

} // namespace hbnf
