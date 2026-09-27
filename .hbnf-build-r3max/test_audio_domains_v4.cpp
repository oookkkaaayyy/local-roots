#include <cassert>
#include <cstdint>
#include <cstdio>
#include <set>
#define USERMOD_ID_AUDIOREACTIVE 32
struct um_data_t{uint8_t u_size=0;void **u_data=nullptr;};
struct Store{bool ok=false;um_data_t* d=nullptr;} g;
struct UsermodManager{static bool getUMData(um_data_t **o,uint8_t id){assert(id==32);*o=g.d;return g.ok;}};
#include "hbnf_animartrix_audio_bridge.h"

static void baseline(uint8_t f[16]){
  for(int i=0;i<16;i++) f[i]=(uint8_t)(i<4?62:(i<11?50:38));
}
static void excite(uint8_t f[16],int band,uint8_t level){
  baseline(f);
  const int a=band==0?0:(band==1?4:11), z=band==0?4:(band==1?11:16);
  for(int i=a;i<z;i++) f[i]=level;
}
struct Sig{uint64_t hash=1469598103934665603ull;int changed=0;long delta=0;int darkChanged=0;};

static Sig render(int domain,int band,uint8_t style,uint8_t profile,uint8_t salt){
  hbnf::AnimartrixAudioBridge b;
  b.setScene((uint8_t)(220+((domain*7+band*3)%28)));
  uint8_t fft[16]; float vol=70;
  void* ptrs[3]={&vol,nullptr,fft};
  um_data_t u;u.u_size=3;u.u_data=ptrs;g.ok=true;g.d=&u;
  const uint8_t variant=(uint8_t)(((domain&3)<<3)|((band+domain)&7)|(((domain+band*2)&7)<<5));
  for(int t=0;t<1000;t+=20){
    baseline(fft);vol=70;
    b.beginFrame(1.0f,(uint32_t)t,profile,style,236,32,16,variant,salt);
  }
  for(int n=0;n<6;n++){
    excite(fft,band,178);vol=138;
    b.beginFrame(1.0f,(uint32_t)(1000+n*20),profile,style,236,32,16,variant,salt);
  }
  Sig s;
  for(int y=0;y<16;y++)for(int x=0;x<32;x++){
    const bool dark=((x*3+y*5)%17)==0;
    uint8_t r=dark?0:(uint8_t)(28+(x*7)%170);
    uint8_t gg=dark?0:(uint8_t)(32+(y*11)%170);
    uint8_t bb=dark?0:(uint8_t)(36+((x+y)*9)%170);
    const int r0=r,g0=gg,b0=bb;
    b.modulate(x,y,r,gg,bb);
    const int d=abs((int)r-r0)+abs((int)gg-g0)+abs((int)bb-b0);
    if(d){s.changed++;s.delta+=d;}
    if(dark&&(r||gg||bb))s.darkChanged++;
    uint32_t p=((uint32_t)r<<16)|((uint32_t)gg<<8)|bb;
    s.hash^=(uint64_t)p+(uint64_t)(x+1)*131u+(uint64_t)(y+1)*313u;
    s.hash*=1099511628211ull;
  }
  return s;
}

int main(){
  const uint8_t styles[4]={176,236,176,136};
  const uint8_t profiles[4]={96,176,136,56};
  for(int d=0;d<4;d++){
    std::set<uint64_t> bandSigs;
    for(int band=0;band<3;band++){
      Sig s=render(d,band,styles[d],profiles[d],(uint8_t)(37+d*41+band*13));
      assert(s.changed>12);
      assert(s.delta>160);
      assert(s.darkChanged==0);
      bandSigs.insert(s.hash);
    }
    assert(bandSigs.size()==3);
  }

  // Same bass input must still produce scene/domain-relative behavior rather than
  // four aliases of Course Flow.
  std::set<uint64_t> domainSigs;
  for(int d=0;d<4;d++) domainSigs.insert(render(d,0,styles[d],profiles[d],(uint8_t)(91+d*27)).hash);
  assert(domainSigs.size()==4);

  puts("PASS audio domains v4: every domain responds to low/mid/high with distinct source-coupled behavior");
}
