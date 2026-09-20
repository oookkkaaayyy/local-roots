#include <cassert>
#include <cstdint>
#include <cstdio>
#define HBNF_VIBE_ANIMARTRIX 1
#define USERMOD_ID_AUDIOREACTIVE 32
struct um_data_t { uint8_t u_size=0; void **u_data=nullptr; };
struct MockAudioStore { bool ok=false; um_data_t *data=nullptr; } gAudio;
struct UsermodManager {
  static bool getUMData(um_data_t **out, uint8_t id){
    assert(id==USERMOD_ID_AUDIOREACTIVE);
    *out=gAudio.data;
    return gAudio.ok;
  }
};
#include "../firmware_patch/hbnf_animartrix_audio_bridge.h"

int main(){
  hbnf::AnimartrixAudioBridge b;
  assert(b.apply(3.25f,1000)==3.25f);

  uint8_t fft[16]; for(int i=0;i<16;i++) fft[i]=(i<4?100:(i<11?55:30));
  float vol=100; void* ptrs[3]={&vol,nullptr,fft};
  um_data_t d; d.u_size=3; d.u_data=ptrs; gAudio.data=&d; gAudio.ok=true;

  float first=b.apply(1.0f,1020);
  for(int n=1;n<=20;n++) b.apply(1.0f,1020+n*21);
  for(int i=0;i<4;i++) fft[i]=255; vol=180;
  float hit=b.apply(1.0f,1461);
  assert(first>=.1f&&first<=10.0f&&hit>=.1f&&hit<=10.0f);
  assert(hit>first);

  gAudio.ok=false;
  float fail=b.apply(4.75f,1482);
  assert(fail==4.75f);
  printf("PASS: WLED16 UMData bridge R2; first %.3f hit %.3f fail-open %.2f; sizeof bridge=%zu\n",
         first,hit,fail,sizeof(b));
}
