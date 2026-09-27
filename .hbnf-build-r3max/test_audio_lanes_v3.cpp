#include <cassert>
#include <cstdint>
#include <cstdio>
#include <array>
#include <set>
#define USERMOD_ID_AUDIOREACTIVE 32
struct um_data_t{uint8_t u_size=0;void **u_data=nullptr;};
struct Store{bool ok=false;um_data_t* d=nullptr;} g;
struct UsermodManager{static bool getUMData(um_data_t **o,uint8_t id){assert(id==32);*o=g.d;return g.ok;}};
#include "hbnf_animartrix_audio_bridge.h"

static void steady(uint8_t f[16]){
  for(int i=0;i<16;i++) f[i]=(uint8_t)(i<4?64:(i<11?52:40));
}
static void isolate(uint8_t f[16],int band,int level){
  steady(f);
  const int a=band==0?0:(band==1?4:11), z=band==0?4:(band==1?11:16);
  for(int i=a;i<z;i++) f[i]=(uint8_t)level;
}
static void full(uint8_t f[16],int level){ for(int i=0;i<16;i++) f[i]=(uint8_t)level; }

struct Sig{
  uint64_t hash=1469598103934665603ull;
  long delta=0;
  int changed=0;
  int saturated=0;
  int darkChanged=0;
};

static Sig render(int band,bool mixed=false,bool hard=false,uint8_t scene=220){
  hbnf::AnimartrixAudioBridge b;
  b.setScene(scene);
  uint8_t fft[16]; float vol=72;
  void* ptrs[3]={&vol,nullptr,fft};
  um_data_t u; u.u_size=3; u.u_data=ptrs; g.ok=true; g.d=&u;

  for(int t=0;t<1200;t+=20){ steady(fft); vol=72; b.beginFrame(1.0f,(uint32_t)t,96,236,230,32,16); }
  for(int n=0;n<5;n++){
    if(mixed) full(fft,hard?238:132); else isolate(fft,band,hard?238:132);
    vol=hard?230:115;
    b.beginFrame(1.0f,(uint32_t)(1200+n*20),96,236,230,32,16);
  }

  Sig s;
  for(int y=0;y<16;y++) for(int x=0;x<32;x++){
    const bool dark=((x+y)%11)==0;
    uint8_t r=dark?0:(uint8_t)(35+(x*5)%150);
    uint8_t gg=dark?0:(uint8_t)(45+(y*9)%150);
    uint8_t bb=dark?0:(uint8_t)(55+((x+y)*7)%150);
    const int r0=r,g0=gg,b0=bb;
    b.modulate(x,y,r,gg,bb);
    const int d=abs((int)r-r0)+abs((int)gg-g0)+abs((int)bb-b0);
    if(d){s.changed++;s.delta+=d;}
    if(dark && (r||gg||bb)) s.darkChanged++;
    if(r==255||gg==255||bb==255) s.saturated++;
    const uint32_t packed=((uint32_t)r<<16)|((uint32_t)gg<<8)|bb;
    s.hash^=(uint64_t)packed+(uint64_t)(x+1)*131u+(uint64_t)(y+1)*313u;
    s.hash*=1099511628211ull;
  }
  return s;
}

int main(){
  const Sig bass=render(0), mids=render(1), treble=render(2);
  assert(bass.changed>20 && mids.changed>20 && treble.changed>8);
  assert(bass.hash!=mids.hash && mids.hash!=treble.hash && bass.hash!=treble.hash);

  // Source-coupled contract: audio may reshape existing pixels, never paint over black background.
  assert(bass.darkChanged==0 && mids.darkChanged==0 && treble.darkChanged==0);

  // A full-spectrum passage must stay bounded rather than stacking three independent overlays.
  const Sig mixed=render(0,true,false);
  assert(mixed.saturated<180);
  assert(mixed.delta < bass.delta+mids.delta+treble.delta);

  // Strong hits stay obvious, but still obey source-coupled/no-background-painting behavior.
  const Sig hardBass=render(0,false,true,220);
  const Sig hardMid=render(1,false,true,221);
  const Sig hardTreble=render(2,false,true,222);
  assert(hardBass.changed>30 && hardMid.changed>30 && hardTreble.changed>12);
  assert(hardBass.darkChanged==0 && hardMid.darkChanged==0 && hardTreble.darkChanged==0);
  assert(hardBass.hash!=hardMid.hash && hardMid.hash!=hardTreble.hash);

  printf("PASS audio lanes v3: source-coupled low/mid/high, shared budget, no dark-pixel overlay\n");
}
