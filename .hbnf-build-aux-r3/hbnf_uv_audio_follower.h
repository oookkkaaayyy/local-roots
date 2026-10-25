#pragma once
#include <stdint.h>

namespace hbnf {

static constexpr uint8_t UV_FOLLOW_EFFECT_ID = 248;
static constexpr uint32_t UV_AUDIO_STALE_AFTER_MS = 300;

inline bool uvAudioFresh(uint32_t nowMs, uint32_t lastPacketMs) {
  return lastPacketMs != 0 && (uint32_t)(nowMs - lastPacketMs) <= UV_AUDIO_STALE_AFTER_MS;
}

inline uint8_t uvFollowLevel(uint8_t audioEnergy, uint8_t channelCap, bool fresh, bool outputsVerified) {
  if (!fresh || !outputsVerified || channelCap == 0) return 0;
  return (uint8_t)(((uint16_t)audioEnergy * channelCap + 127u) / 255u);
}

} // namespace hbnf
