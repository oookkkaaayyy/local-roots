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

static void base(uint8_t f[16]){
  for(int i=0;i<16;i++) f[i]=(uint8_t)(i<4?56:(i<11?48:38));
}
static void bandHit(uint8_t f[16],int band,int level){
  base(f);
  const int a=band==0?0:(band==1?4:11), z=band==0?4:(band==1?11:16);
  for(int i=a;i<z;i++) f[i]=(uint8_t)level;
}
struct Sig{uint64_t hash=1469598103934665603ull;int changed=0;int maxDelta=0;};

static Sig render(uint8_t scene,int band,int level,float vol,int frames){
  hbnf::AnimartrixAudioBridge b;
  b.setScene(scene);
  uint8_t fft[16]; float volume=64;
  void* ptrs[3]={&volume,nullptr,fft};
  um_data_t u;u.u_size=3;u.u_data=ptrs;g.ok=true;g.d=&u;
  for(int t=0;t<900;t+=20){base(fft);volume=64;b.beginFrame(1.0f,(uint32_t)t,96,236,220,32,16);}
  for(int n=0;n<frames;n++){bandHit(fft,band,level);volume=vol;b.beginFrame(1.0f,(uint32_t)(900+n*20),96,236,220,32,16);}
  Sig s;
  for(int y=0;y<16;y++)for(int x=0;x<32;x++){
    uint8_t r=70,gg=80,bb=90;
    b.modulate(x,y,r,gg,bb);
    int d=abs((int)r-70)+abs((int)gg-80)+abs((int)bb-90);
    if(d){s.changed++; if(d>s.maxDelta)s.maxDelta=d;}
    const uint32_t packed=((uint32_t)r<<16)|((uint32_t)gg<<8)|bb;
    s.hash^=(uint64_t)packed+(uint64_t)(x+1)*131u+(uint64_t)(y+1)*313u;
    s.hash*=1099511628211ull;
  }
  return s;
}

int main(){
  // Minor musical detail must be visibly represented, not only hard bangs.
  for(int band=0;band<3;band++){
    const Sig subtle=render(220,band,118,105,3);
    assert(subtle.changed>=8);
    assert(subtle.maxDelta>=4);
  }

  // Bass/mids/treble must remain distinct.
  const Sig bass=render(221,0,180,150,4);
  const Sig mids=render(221,1,180,150,4);
  const Sig treble=render(221,2,180,150,4);
  assert(bass.hash!=mids.hash && mids.hash!=treble.hash && bass.hash!=treble.hash);

  // Strong response must be obvious and scene-relative, with no single universal geometry.
  std::set<uint64_t> hardScenes;
  for(uint8_t scene=220;scene<224;scene++){
    const Sig hard=render(scene,0,245,235,6);
    assert(hard.changed>=24);
    assert(hard.maxDelta>=10);
    hardScenes.insert(hard.hash);
  }
  assert(hardScenes.size()>=3);

  printf("PASS audio geometry v2: subtle 3-band visibility, distinct band response, strong scene variation\n");
}
