#include <cassert>
#include <cstdint>
#include "hbnf_uv_audio_follower.h"

int main() {
  using hbnf::UV_AUDIO_STALE_AFTER_MS;
  assert(hbnf::uvAudioFresh(1000u, 800u));
  assert(hbnf::uvAudioFresh(1100u, 800u));
  assert(!hbnf::uvAudioFresh(1101u, 800u));
  assert(!hbnf::uvAudioFresh(20u, 0u));
  assert(hbnf::uvAudioFresh(12u, 0xfffffff0u)); // millis wrap is safe

  assert(hbnf::uvFollowLevel(255, 180, true, true) == 180);
  assert(hbnf::uvFollowLevel(128, 180, true, true) == 90);
  assert(hbnf::uvFollowLevel(128, 64, true, true) == 32);
  assert(hbnf::uvFollowLevel(255, 180, false, true) == 180);
  assert(hbnf::uvFollowLevel(0, 64, false, true) == 64);
  assert(hbnf::uvFollowLevel(255, 180, true, false) == 0);
  assert(hbnf::uvFollowLevel(255, 0, true, true) == 0);
  assert(UV_AUDIO_STALE_AFTER_MS == 300u);
}
