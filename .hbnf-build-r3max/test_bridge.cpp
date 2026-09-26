#include <cassert>
#include <cstdint>
#include <cstdio>
#include <array>
#define USERMOD_ID_AUDIOREACTIVE 32
struct um_data_t{uint8_t u_size=0;void **u_data=nullptr;};
struct Store{bool ok=false;um_data_t* d=nullptr;} g;
struct UsermodManager{static bool getUMData(um_data_t **o,uint8_t id){assert(id==32);*o=g.d;return g.ok;}};
#include "hbnf_animartrix_audio_bridge.h"
static void fill(uint8_t f[16],int band,bool hit){for(int i=0;i<16;i++)f[i]=(i<4?70:(i<11?52:36));if(hit){int a=band==0?0:(band==1?4:11),z=band==0?4:(band==1?11:16);for(int i=a;i<z;i++)f[i]=230;}}
static std::array<int,3> sample(hbnf::AnimartrixAudioBridge &b,int x,int y){uint8_t r=70,gc=80,bl=90;b.modulate(x,y,r,gc,bl);return{r,gc,bl};}
int main(){
 hbnf::AnimartrixAudioBridge b;g.ok=false;assert(b.beginFrame(4.25f,100,96,216,220,32,16)==4.25f);auto n=sample(b,16,8);assert(n[0]==70&&n[1]==80&&n[2]==90);
 hbnf::AnimartrixAudioBridge hue;hue.setScene(220);assert(hue.beginFrame(1.0f,120,96,176,205,32,16)==1.0f);auto h0=sample(hue,8,8);hue.setScene(221);auto h1=sample(hue,8,8);hue.setScene(226);auto h6=sample(hue,8,8);assert(h0!=h1&&h1!=h6&&h0!=h6);
 uint8_t fft[16];float vol=90;void* ptrs[3]={&vol,nullptr,fft};um_data_t u;u.u_size=3;u.u_data=ptrs;g.ok=true;g.d=&u;
 for(int t=0;t<1000;t+=20){fill(fft,0,false);b.beginFrame(1.0f,t,16,56,220,32,16);}fill(fft,0,true);vol=190;float sp=b.beginFrame(1.0f,1000,16,56,220,32,16);assert(sp==1.0f);for(int t=1020;t<=1300;t+=20){fill(fft,0,true);vol=220;assert(b.beginFrame(1.0f,t,216,240,230,32,16)==1.0f);}
 auto center=sample(b,16,8),edge=sample(b,0,0);assert(center[0]>=edge[0]);assert((center!=std::array<int,3>{70,80,90}));
 hbnf::AnimartrixAudioBridge h;vol=90;for(int t=0;t<1000;t+=20){fill(fft,0,false);h.beginFrame(1.0f,t,216,240,230,32,16);}fill(fft,0,true);vol=200;h.beginFrame(1.0f,1000,216,240,230,32,16);auto c0=sample(h,16,8),c1=sample(h,3,3),c2=sample(h,29,12);assert(c0!=c1||c1!=c2);for(auto q:{c0,c1,c2})for(int v:q)assert(v>=0&&v<=255);
 // Strongly blue source frames must retain source detail but gain sparse warm diversity instead of remaining all-blue.
 hbnf::AnimartrixAudioBridge blue;vol=90;for(int t=0;t<800;t+=20){fill(fft,1,false);blue.beginFrame(1.0f,t,96,176,205,32,16);}
 int changedBlue=0,warmPixels=0;for(int y=0;y<16;y++)for(int x=0;x<32;x++){uint8_t rr=10,gg=35,bb=220;blue.modulate(x,y,rr,gg,bb);if(rr!=10||gg!=35||bb!=220)changedBlue++;if(rr>20)warmPixels++;}
 fprintf(stderr, "blue visual diagnostic changed=%d warm=%d\n",changedBlue,warmPixels);
 assert(changedBlue>20&&warmPixels>20&&warmPixels<300);
 hbnf::AnimartrixAudioBridge a1,a2;vol=90;for(int t=0;t<=1100;t+=20){bool hit=t>=1000&&t<1080;fill(fft,2,hit);vol=hit?180:90;a1.beginFrame(1.0f,t,136,136,190,32,16);}std::array<uint8_t,16> fcopy;for(int i=0;i<16;i++)fcopy[i]=fft[i];float vol2=90;void* p2[3]={&vol2,nullptr,fcopy.data()};um_data_t u2;u2.u_size=3;u2.u_data=p2;g.d=&u2;for(int t=0;t<=1100;t+=20){bool hit=t>=1000&&t<1080;fill(fcopy.data(),2,hit);vol2=hit?180:90;a2.beginFrame(1.0f,t,136,136,190,32,16);}auto q1=sample(a1,12,7),q2=sample(a2,12,7);assert(q1==q2);
 // Blocking tempo ownership contract: manual mode ignores heavy audio exactly.
 auto heavy=[&](hbnf::AnimartrixAudioBridge &x){float out=0;for(int t=0;t<=6000;t+=20){for(int i=0;i<16;i++)fcopy[i]=245;vol2=255;out=x.beginFrame(1.35f,(uint32_t)t,96,240,220,32,16,false);assert(fabsf(out-1.35f)<0.0001f);}return out;};
 hbnf::AnimartrixAudioBridge manualTempo;assert(fabsf(heavy(manualTempo)-1.35f)<0.0001f);

 // One cough/clap transient cannot establish tempo or change AUTO global speed.
 hbnf::AnimartrixAudioBridge transient;float transientSpeed=1.0f;
 for(int t=0;t<=5000;t+=20){bool hit=(t==1000);for(int i=0;i<16;i++)fcopy[i]=hit?255:0;vol2=hit?255:24;transientSpeed=transient.beginFrame(1.0f,(uint32_t)t,96,240,220,32,16,true);if(hit||t>1100)assert(fabsf(transientSpeed-1.0f)<0.0001f);}

 // Sustained periodic semantic onsets qualify: 80 BPM is slower, 150 BPM is faster.
 auto runTrack=[&](hbnf::AnimartrixAudioBridge &x,int interval,int band){
   float out=1.0f; x.reset();
   for(int t=0;t<=18000;t+=20){
     const bool hit=(t%interval)<200;
     for(int i=0;i<16;i++)fcopy[i]=0;
     if(hit){int a=band==0?0:(band==1?4:11),z=band==0?4:(band==1?11:16);for(int i=a;i<z;i++)fcopy[i]=225;}
     vol2=hit?220:34;
     out=x.beginFrame(1.0f,(uint32_t)t,96,240,220,32,16,true);
   }
   return out;
 };
 hbnf::AnimartrixAudioBridge slowTempo,fastTempo;
 const float slowSpeed=runTrack(slowTempo,750,0),fastSpeed=runTrack(fastTempo,400,0);
 assert(slowSpeed<0.95f); assert(fastSpeed>1.05f); assert(fastSpeed>slowSpeed);

 // Semantic band fixtures must remain distinct and visibly render differently.
 std::array<long,3> bandSums[3]{};
 std::array<uint8_t,3> bandReadback[3]{};
 for(int band=0;band<3;band++){
   hbnf::AnimartrixAudioBridge visual; visual.reset();
   for(int t=0;t<=5000;t+=20){
     for(int i=0;i<16;i++)fcopy[i]=0;
     int a=band==0?0:(band==1?4:11),z=band==0?4:(band==1?11:16);
     for(int i=a;i<z;i++)fcopy[i]=190;
     vol2=145; visual.beginFrame(1.0f,(uint32_t)t,96,240,230,32,16,true);
   }
   bandReadback[band]={visual.bassPulse(),visual.midPulse(),visual.treblePulse()};
   for(int y=0;y<16;y++)for(int x=0;x<32;x++){uint8_t r=70,gc=80,bl=90;visual.modulate(x,y,r,gc,bl);bandSums[band][0]+=r;bandSums[band][1]+=gc;bandSums[band][2]+=bl;}
 }
 assert(bandReadback[0][0]>bandReadback[0][1]&&bandReadback[0][0]>bandReadback[0][2]);
 assert(bandReadback[1][1]>bandReadback[1][0]&&bandReadback[1][1]>bandReadback[1][2]);
 assert(bandReadback[2][2]>bandReadback[2][0]&&bandReadback[2][2]>bandReadback[2][1]);
 assert(bandSums[0]!=bandSums[1]&&bandSums[1]!=bandSums[2]&&bandSums[0]!=bandSums[2]);
 printf("PASS blocking contract: manual speed, transient immunity, slow/fast semantic tempo, distinct bass/mids/treble response; slow %.2f fast %.2f\n",slowSpeed,fastSpeed);
 printf("PASS WOW MAX bridge/render; speed %.2f center %d,%d,%d edge %d,%d,%d bytes=%zu\n",sp,center[0],center[1],center[2],edge[0],edge[1],edge[2],sizeof(hbnf::AnimartrixAudioBridge));
}
