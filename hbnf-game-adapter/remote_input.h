#pragma once
#include <cstdint>
#include "game_core.h"

namespace hbnf_game {

class RemoteInputBroker {
 public:
  static constexpr uint32_t kLeaseMs = 2200;

  enum class Claim : uint8_t { Ok, Busy, Invalid };

  Claim claim(uint8_t client, uint8_t slot, bool privileged, uint32_t nowMs, bool physicalPresent) {
    if (slot >= 2) return Claim::Invalid;
    expire(nowMs);
    if (physicalPresent) return Claim::Busy;
    Slot& s = slots_[slot];
    if (s.owner != kNoOwner && s.owner != client) return Claim::Busy;
    releaseClientOtherSlots(client, slot);
    s.owner = client;
    s.privileged = privileged;
    s.lastSeen = nowMs;
    s.pad = {};
    s.pad.connected = true;
    return Claim::Ok;
  }

  bool update(uint8_t client, uint8_t slot, uint16_t mask, uint32_t nowMs) {
    if (slot >= 2) return false;
    expire(nowMs);
    Slot& s = slots_[slot];
    if (s.owner != client) return false;
    s.lastSeen = nowMs;
    s.pad = decode(mask);
    s.pad.connected = true;
    return true;
  }

  void heartbeat(uint8_t client, uint8_t slot, uint32_t nowMs) {
    if (slot < 2 && slots_[slot].owner == client) slots_[slot].lastSeen = nowMs;
  }

  void releaseClient(uint8_t client) {
    for (auto& s : slots_) if (s.owner == client) clear(s);
  }

  void preempt(uint8_t slot) {
    if (slot < 2) clear(slots_[slot]);
  }

  void clearAll() {
    clear(slots_[0]); clear(slots_[1]);
  }

  void expire(uint32_t nowMs) {
    for (auto& s : slots_) {
      if (s.owner != kNoOwner && uint32_t(nowMs - s.lastSeen) > kLeaseMs) clear(s);
    }
  }

  PadState pad(uint8_t slot, uint32_t nowMs) {
    expire(nowMs);
    if (slot >= 2 || slots_[slot].owner == kNoOwner) return {};
    return slots_[slot].pad;
  }

  bool privileged(uint8_t slot, uint32_t nowMs) {
    expire(nowMs);
    return slot < 2 && slots_[slot].owner != kNoOwner && slots_[slot].privileged;
  }

  int owner(uint8_t slot, uint32_t nowMs) {
    expire(nowMs);
    return slot < 2 && slots_[slot].owner != kNoOwner ? int(slots_[slot].owner) : -1;
  }

 private:
  static constexpr uint8_t kNoOwner = 255;
  struct Slot {
    uint8_t owner = kNoOwner;
    bool privileged = false;
    uint32_t lastSeen = 0;
    PadState pad{};
  };
  Slot slots_[2]{};

  static void clear(Slot& s) {
    s.owner = kNoOwner; s.privileged = false; s.lastSeen = 0; s.pad = {};
  }

  void releaseClientOtherSlots(uint8_t client, uint8_t keep) {
    for (uint8_t i=0;i<2;++i) if (i != keep && slots_[i].owner == client) clear(slots_[i]);
  }

  static PadState decode(uint16_t m) {
    PadState p;
    p.connected = true;
    p.up = (m & 1u) != 0;
    p.down = (m & 2u) != 0;
    p.left = (m & 4u) != 0;
    p.right = (m & 8u) != 0;
    p.a = (m & 16u) != 0;
    p.b = (m & 32u) != 0;
    p.start = (m & 64u) != 0;
    p.select = (m & 128u) != 0;
    return p;
  }
};

} // namespace hbnf_game
