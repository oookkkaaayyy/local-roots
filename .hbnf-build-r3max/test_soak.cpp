#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstdio>
#define USERMOD_ID_AUDIOREACTIVE 32
struct um_data_t{uint8_t u_size=0;void **u_data=nullptr;};
struct Store{bool ok=false;um_data_t* d=nullptr;} g;
struct UsermodManager{static bool getUMData(um_data_t **o,uint8_t id){assert(id==32);*o=g.d;return g.ok;}};
#include "hbnf_animartrix_audio_bridge.h"

static uint32_t lcg(uint32_t &s){s=s*1664525u+1013904223u;return s;}
static void sample(hbnf::AnimartrixAudioBridge &b,int x,int y,uint8_t &r,uint8_t &g0,uint8_t &bl){b.modulate(x,y,r,g0,bl);}

int main(){
 uint8_t fft[16];float vol=90;void* ptrs[3]={&vol,nullptr,fft};um_data_t u;u.u_size=3;u.u_data=ptrs;g.ok=true;g.d=&u;
 hbnf::AnimartrixAudioBridge a,b;
 uint32_t rng=0x48424e46u, now=0;
 const uint32_t frames=1080000u; // six simulated hours at 20ms/frame
 uint64_t checksumA=0,checksumB=0;
 for(uint32_t n=0;n<frames;n++,now+=20){
   const bool beat=(n%25u)<3u, bar=(n%100u)<4u, drop=(n%800u)>=700u && (n%800u)<720u;
   for(int i=0;i<16;i++){
     uint32_t z=lcg(rng);int base=i<4?68:(i<11?50:34);int jitter=(int)((z>>28)&7)-3;
     int add=beat?(i<4?95:(i<11?40:22)):0; if(bar)add+=i<4?35:12;if(drop)add+=i<11?48:28;
     int v=base+jitter+add;if(v<0)v=0;if(v>255)v=255;fft[i]=(uint8_t)v;
   }
   vol=(float)(88+(beat?70:0)+(drop?45:0));
   const uint8_t profile=(uint8_t)((n/3600u)%6u==0?16:(n/3600u)%6u==1?56:(n/3600u)%6u==2?96:(n/3600u)%6u==3?136:(n/3600u)%6u==4?176:216);
   const uint8_t style=(uint8_t)((n/5400u)%6u==0?16:(n/5400u)%6u==1?56:(n/5400u)%6u==2?96:(n/5400u)%6u==3?136:(n/5400u)%6u==4?176:236);
   const float sa=a.beginFrame(1.0f,now,profile,style,205,32,16);
   const float sb=b.beginFrame(1.0f,now,profile,style,205,32,16);
   assert(isfinite(sa)&&isfinite(sb)&&sa>=0.099f&&sa<=10.001f&&sb>=0.099f&&sb<=10.001f);
   assert(fabsf(sa-sb)<0.00001f);
   for(int k=0;k<3;k++){
     int x=k==0?0:(k==1?16:31),y=k==0?0:(k==1?8:15);
     uint8_t ra=60+k*20,ga=90+k*10,ba=120-k*15, rb=ra,gb=ga,bb=ba;
     sample(a,x,y,ra,ga,ba);sample(b,x,y,rb,gb,bb);
     assert(ra==rb&&ga==gb&&ba==bb);
     checksumA=checksumA*1315423911u+ra*65536u+ga*256u+ba;
     checksumB=checksumB*1315423911u+rb*65536u+gb*256u+bb;
   }
 }
 assert(checksumA==checksumB);
 assert(sizeof(hbnf::AnimartrixAudioBridge)<512);
 printf("PASS WOW MAX 6h deterministic soak; frames=%u checksum=%llu bytes=%zu\n",frames,(unsigned long long)checksumA,sizeof(hbnf::AnimartrixAudioBridge));
}
