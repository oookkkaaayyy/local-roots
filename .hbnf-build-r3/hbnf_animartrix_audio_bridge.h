#pragma once
#include "hbnf_vibe16.h"

namespace hbnf {
class AnimartrixAudioBridge {
 public:
  float apply(float baseSpeed,uint32_t nowMs,uint8_t profileCode=96){
    um_data_t *um=nullptr;
    if(!UsermodManager::getUMData(&um,USERMOD_ID_AUDIOREACTIVE) || !um || um->u_size<3 || !um->u_data || !um->u_data[0] || !um->u_data[2]) return baseSpeed;
    float volume=*reinterpret_cast<float*>(um->u_data[0]);
    uint8_t *fft=reinterpret_cast<uint8_t*>(um->u_data[2]);
    float dt=lastMs_?((nowMs-lastMs_)/1000.0f):0.021f; lastMs_=nowMs;
    vibe_.update(fft,volume,dt);
    const VibeProfile p=profileFromIntensity(profileCode);
    const float factor=vibe_.profileFactor(p);
    const float out=baseSpeed*factor;
    return out<0.10f?0.10f:(out>10.0f?10.0f:out);
  }
 private:
  Vibe16 vibe_;
  uint32_t lastMs_=0;
};
} // namespace hbnf
