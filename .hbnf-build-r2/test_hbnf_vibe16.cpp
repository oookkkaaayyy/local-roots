#include <array>
#include <cassert>
#include <cmath>
#include <cstdio>
#include "../firmware_patch/hbnf_vibe16.h"

static float clampf(float x,float a,float b){return x<a?a:(x>b?b:x);}

struct Sample { std::array<uint8_t,16> fft{}; float vol=0; };

static Sample musicalProfile(int tMs) {
  float s=tMs/1000.0f;
  bool beat=fmodf(s,0.5f)<0.07f;
  bool bar=fmodf(s,2.0f)<0.07f;
  float bass=100,mid=52,treb=34,vol=105;
  float wob=6*sinf(s*1.9f)+3*sinf(s*.31f);
  Sample o;
  for(int i=0;i<16;i++){
    float base=i<4?bass:(i<11?mid:treb);
    float hit=beat?(i<4?55:(i<11?24:14)):0;
    float accent=bar?(i<4?28:8):0;
    o.fft[i]=(uint8_t)clampf(base+wob+hit+accent,0,255);
  }
  o.vol=clampf(vol+(beat?35:0),0,255);
  return o;
}

static Sample steadyProfile(int tMs) {
  Sample o;
  float s=tMs/1000.0f;
  float tiny=1.4f*sinf(s*2.1f)+0.7f*sinf(s*.37f);
  for(int i=0;i<16;i++){
    float base=i<4?75:(i<11?58:44);
    o.fft[i]=(uint8_t)clampf(base+tiny,0,255);
  }
  o.vol=82;
  return o;
}

static Sample clapProfile(int tMs) {
  Sample o=steadyProfile(tMs);
  if(tMs>=1000 && tMs<1070){
    for(int i=4;i<16;i++) o.fft[i]=(uint8_t)clampf(o.fft[i]+95,0,255);
    o.vol=170;
  }
  return o;
}

struct Run {
  float minSpeed=99,maxSpeed=0,lastSpeed=0;
  float speed462=0,speed546=0,speed966=0;
  float maxTransient=0,maxPulse=0;
};

template<class F>
static Run run(F fn,float scale=1.0f,int duration=12000){
  hbnf::Vibe16 v; Run r;
  for(int t=0;t<=duration;t+=21){
    auto p=fn(t);
    for(auto &x:p.fft) x=(uint8_t)clampf(x*scale,0,255);
    p.vol=clampf(p.vol*scale,0,255);
    auto x=v.update(p.fft.data(),p.vol,.021f);
    r.minSpeed=fminf(r.minSpeed,x.speedFactor);
    r.maxSpeed=fmaxf(r.maxSpeed,x.speedFactor);
    r.maxTransient=fmaxf(r.maxTransient,x.transient);
    r.maxPulse=fmaxf(r.maxPulse,x.pulse);
    r.lastSpeed=x.speedFactor;
    if(t==462) r.speed462=x.speedFactor;
    if(t==546) r.speed546=x.speedFactor;
    if(t==966) r.speed966=x.speedFactor;
  }
  return r;
}

int main(){
  auto normal=run(musicalProfile);
  auto half=run(musicalProfile,.5f);
  auto steady=run(steadyProfile);
  auto clap=run(clapProfile);

  for(auto r:{normal,half,steady,clap}){
    assert(r.minSpeed>=0.099f && r.maxSpeed<=2.951f);
  }
  assert(normal.speed462<0.20f);
  assert(normal.speed546>2.20f);
  assert(normal.speed966<0.30f);
  assert(normal.speed546/normal.speed462>10.0f);

  assert(fabsf(normal.speed546-half.speed546)<0.22f);
  assert(fabsf(normal.speed966-half.speed966)<0.12f);

  assert(steady.maxTransient<0.30f);
  assert(steady.maxPulse<0.30f);
  assert(steady.lastSpeed<0.16f);

  assert(clap.maxTransient>0.70f);
  assert(clap.maxPulse>0.70f);
  assert(clap.maxSpeed>1.8f);

  hbnf::Vibe16 sil;
  for(int t=0;t<3000;t+=21){ auto p=steadyProfile(t); sil.update(p.fft.data(),p.vol,.021f); }
  std::array<uint8_t,16> zero{}; hbnf::VibeMetrics z;
  for(int t=0;t<2500;t+=21) z=sil.update(zero.data(),0,.021f);
  assert(z.silent);
  assert(z.speedFactor>=0.099f && z.speedFactor<0.115f);

  printf("PASS: HBNF Vibe16 R2 legibility invariants\n");
  printf("sizeof(Vibe16)=%zu bytes; beat %.3f -> %.3f -> %.3f; steady %.3f; clap max %.3f\n",
         sizeof(hbnf::Vibe16),normal.speed462,normal.speed546,normal.speed966,
         steady.lastSpeed,clap.maxSpeed);
}
