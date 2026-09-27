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
  for(int i=0;i<16;i++) f[i]=(uint8_t)(i<4?54:(i<11?48:40));
}
static void hit(uint8_t f[16],int band){
  base(f);
  const int a=band==0?0:(band==1?4:11), z=band==0?4:(band==1?11:16);
  for(int i=a;i<z;i++) f[i]=245;
}
struct Sig{uint64_t hash=1469598103934665603ull;int changed=0;int cross=0;int offCross=0;};

static Sig render(uint8_t scene,int band){
  hbnf::AnimartrixAudioBridge b;
  b.setScene(scene);
  uint8_t fft[16]; float vol=64;
  void* ptrs[3]={&vol,nullptr,fft};
  um_data_t u;u.u_size=3;u.u_data=ptrs;g.ok=true;g.d=&u;
  for(int t=0;t<1000;t+=20){base(fft);vol=64;b.beginFrame(1.0f,(uint32_t)t,96,236,220,32,16);}
  for(int t=1000;t<1120;t+=20){hit(fft,band);vol=235;b.beginFrame(1.0f,(uint32_t)t,96,236,220,32,16);}

  Sig s;
  for(int y=0;y<16;y++)for(int x=0;x<32;x++){
    uint8_t r=70,gg=80,bb=90;
    b.modulate(x,y,r,gg,bb);
    const bool changed=(r!=70||gg!=80||bb!=90);
    if(changed){
      s.changed++;
      const bool oldPlus=(x==16||y==8||x+y==24);
      if(oldPlus)s.cross++; else s.offCross++;
    }
    const uint32_t packed=((uint32_t)r<<16)|((uint32_t)gg<<8)|bb;
    s.hash^=(uint64_t)packed + (uint64_t)(x+1)*131u + (uint64_t)(y+1)*313u;
    s.hash*=1099511628211ull;
  }
  return s;
}

int main(){
  std::set<uint64_t> sceneHashes;
  for(uint8_t scene=1;scene<=4;scene++){
    const Sig s=render(scene,0);
    assert(s.changed>0);
    assert(s.offCross>0);
    sceneHashes.insert(s.hash);
  }
  assert(sceneHashes.size()>=3);

  const Sig bass=render(1,0), mids=render(1,1), treble=render(1,2);
  assert(bass.hash!=mids.hash);
  assert(mids.hash!=treble.hash);
  assert(bass.hash!=treble.hash);

  printf("PASS accepted-base audio geometry: scene variants=%zu bass=%llu mids=%llu treble=%llu\n",
    sceneHashes.size(),
    (unsigned long long)bass.hash,
    (unsigned long long)mids.hash,
    (unsigned long long)treble.hash);
}
