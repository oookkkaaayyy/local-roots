#include <cassert>
#include <cstdint>
#include <cstdio>
#define USERMOD_ID_AUDIOREACTIVE 32
struct um_data_t{uint8_t u_size=0;void **u_data=nullptr;};
struct Store{bool ok=false;um_data_t* d=nullptr;} g;
struct UsermodManager{static bool getUMData(um_data_t **o,uint8_t id){assert(id==32);*o=g.d;return g.ok;}};
#include "hbnf_animartrix_audio_bridge.h"
static float drive(uint8_t profile,int hitBand){hbnf::AnimartrixAudioBridge b;uint8_t fft[16];float vol=90;void* ptrs[3]={&vol,nullptr,fft};um_data_t u;u.u_size=3;u.u_data=ptrs;g={true,&u};float mx=0;for(int t=0;t<1800;t+=20){for(int i=0;i<16;i++)fft[i]=(i<4?70:(i<11?52:36));if(t>=1000&&t<1070){int a=hitBand==0?0:(hitBand==1?4:11),z=hitBand==0?4:(hitBand==1?11:16);for(int i=a;i<z;i++)fft[i]=220;vol=170;}else vol=90;float x=b.apply(1.0f,t,profile);if(x>mx)mx=x;}return mx;}
int main(){g.ok=false;hbnf::AnimartrixAudioBridge z;assert(z.apply(4.25f,100,96)==4.25f);float bass=drive(16,0),trebOnBass=drive(176,0),treb=drive(176,2),bassOnTreb=drive(16,2);assert(bass>trebOnBass+0.45f);assert(treb>bassOnTreb+0.35f);printf("PASS R3 bridge profiles; bass %.2f treble-on-bass %.2f treble %.2f bass-on-treble %.2f\n",bass,trebOnBass,treb,bassOnTreb);}
