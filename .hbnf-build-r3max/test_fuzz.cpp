#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <limits>
#define USERMOD_ID_AUDIOREACTIVE 32
struct um_data_t{uint8_t u_size=0;void **u_data=nullptr;};
struct Store{bool ok=false;um_data_t* d=nullptr;} g;
struct UsermodManager{static bool getUMData(um_data_t **o,uint8_t id){assert(id==32);*o=g.d;return g.ok;}};
#include "hbnf_animartrix_audio_bridge.h"
static uint32_t rnd(uint32_t &s){s=s*1664525u+1013904223u;return s;}
int main(){
  hbnf::AnimartrixAudioBridge b;
  uint8_t fft[16]{}; float vol=0; void* ptrs[3]={&vol,nullptr,fft}; um_data_t u;u.u_size=3;u.u_data=ptrs;g.ok=true;g.d=&u;
  uint32_t seed=0x52463321u,now=0xfffff000u; uint64_t checksum=0;
  for(uint32_t frame=0;frame<350000u;frame++){
    const uint32_t dtms=1u+(rnd(seed)%180u); now+=dtms;
    for(int i=0;i<16;i++)fft[i]=(uint8_t)(rnd(seed)>>24);
    vol=(float)(rnd(seed)%400u);
    uint8_t profile=(uint8_t)(rnd(seed)>>24),style=(uint8_t)(rnd(seed)>>24),amount=(uint8_t)(rnd(seed)>>24);
    uint16_t w=(frame%997u==0)?0:(frame%431u==0?1:32),h=(frame%991u==0)?0:(frame%433u==0?1:16);
    float base=((int)(rnd(seed)%2500u)-400)/100.0f;
    float out=b.beginFrame(base,now,profile,style,amount,w,h);
    assert(std::isfinite(out));assert(out>=0.099f&&out<=10.001f);
    for(int k=0;k<4;k++){
      int x=(int)(rnd(seed)%32u),y=(int)(rnd(seed)%16u);uint8_t r=(uint8_t)(rnd(seed)>>24),gg=(uint8_t)(rnd(seed)>>24),bb=(uint8_t)(rnd(seed)>>24);
      b.modulate(x,y,r,gg,bb);checksum=checksum*1099511628211ull+r*65536u+gg*256u+bb;
    }
  }
  // Amount 0 is a strict no-op at the pixel modulation layer.
  for(int i=0;i<16;i++)fft[i]=255;vol=255;b.beginFrame(1.0f,now+20,216,236,0,32,16);uint8_t r=7,gg=11,bb=13;b.modulate(16,8,r,gg,bb);assert(r==7&&gg==11&&bb==13);
  // Missing AudioReactive data must safely fall back to the base animation without pixel mutation.
  g.ok=false;float s=b.beginFrame(27.0f,now+40,216,236,255,32,16);assert(s<=10.001f);r=21;gg=22;bb=23;b.modulate(1,1,r,gg,bb);assert(r==21&&gg==22&&bb==23);
  assert(sizeof(hbnf::AnimartrixAudioBridge)<512);
  printf("PASS WOW MAX randomized bridge fuzz; frames=350000 checksum=%llu bytes=%zu\n",(unsigned long long)checksum,sizeof(hbnf::AnimartrixAudioBridge));
}
