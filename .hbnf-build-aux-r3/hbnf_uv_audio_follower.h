#pragma once
#include <stdint.h>

namespace hbnf {

static constexpr uint8_t UV_FOLLOW_EFFECT_ID = 248;
static constexpr uint8_t UV_FOLLOW_MIN_NONZERO_LEVEL = 1;
static constexpr uint32_t UV_AUDIO_STALE_AFTER_MS = 300;

inline bool uvAudioFresh(uint32_t nowMs, uint32_t lastPacketMs) {
  return lastPacketMs != 0 && (uint32_t)(nowMs - lastPacketMs) <= UV_AUDIO_STALE_AFTER_MS;
}

inline uint8_t uvFollowLevel(uint8_t audioEnergy, uint8_t channelCap, bool fresh, bool outputsVerified) {
  if (!outputsVerified || channelCap == 0) return 0;
  // A missing Matrix packet must not darken a manually selected UV level.
  // Fresh audio modulates the cap, but a silent frame keeps a nonzero cap
  // perceptibly active. Stale audio falls back to that cap.
  if (!fresh) return channelCap;
  const uint8_t followed = (uint8_t)(((uint16_t)audioEnergy * channelCap + 127u) / 255u);
  return followed == 0 ? UV_FOLLOW_MIN_NONZERO_LEVEL : followed;
}

} // namespace hbnf
