#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace hbnf_arcade {

static constexpr size_t kFrameBytes = 32u * 16u * 2u; // RGB565
static constexpr size_t kActionQueueCapacity = 8;
static constexpr uint32_t kOwnerLeaseMs = 2000;
static constexpr uint32_t kGuestLeaseMs = 60000;
static constexpr uint32_t kInputIntervalMs = 50;
static constexpr uint32_t kFrameIntervalMs = 50;
static constexpr uint32_t kPollIntervalMs = 50;
static constexpr uint32_t kHeartbeatIntervalMs = 250;

enum class Role : uint8_t { NONE = 0, OWNER = 1, GUEST = 2 };
enum class Action : uint8_t { UP, DOWN, LEFT, RIGHT, START, PAUSE, RESTART, EXIT };

struct QueuedAction { Action value = Action::UP; uint32_t sequence = 0; Role role = Role::NONE; };

struct Session {
  bool active = false;
  bool hasFrame = false;
  uint8_t game = 0; // 1 Snake, 2 Maze Chase
  char id[17]{};
  char ownerToken[33]{};
  char ownerController[33]{};
  char guestToken[33]{};
  char guestController[33]{};
  uint32_t ownerSequence = 0;
  uint32_t guestSequence = 0;
  uint32_t frameSequence = 0;
  uint32_t lastOwnerMs = 0;
  uint32_t lastActionMs = 0;
  uint32_t lastFrameMs = 0;
  uint32_t lastPollMs = 0;
  uint32_t lastGuestMs = 0;
  uint32_t lastHeartbeatMs = 0;
  bool guestJoined = false;
  uint8_t frame[kFrameBytes]{};
  QueuedAction actions[kActionQueueCapacity]{};
  uint8_t actionHead = 0;
  uint8_t actionCount = 0;
};

inline bool constantTimeEqual(const char* a, const char* b, size_t expectedLength) {
  if (!a || !b) return false;
  const size_t aLength = strnlen(a, expectedLength + 1);
  const size_t bLength = strnlen(b, expectedLength + 1);
  uint8_t diff = static_cast<uint8_t>(aLength ^ bLength);
  for (size_t i = 0; i < expectedLength; ++i) {
    const uint8_t av = i < aLength ? static_cast<uint8_t>(a[i]) : 0;
    const uint8_t bv = i < bLength ? static_cast<uint8_t>(b[i]) : 0;
    diff |= static_cast<uint8_t>(av ^ bv);
  }
  return diff == 0;
}

inline bool validGame(uint8_t game) { return game == 1 || game == 2; }

inline bool start(Session& s, uint8_t game, const char* sessionId,
                  const char* ownerToken, const char* ownerController,
                  const char* suppliedPin, const char* configuredPin, uint32_t now) {
  if (s.active || !validGame(game) || !sessionId || !ownerToken || !ownerController ||
      !configuredPin || !suppliedPin || strnlen(configuredPin, 5) != 4 ||
      strnlen(suppliedPin, 5) != 4 || !constantTimeEqual(suppliedPin, configuredPin, 4) ||
      strnlen(sessionId, 17) != 16 || strnlen(ownerToken, 33) != 32 ||
      strnlen(ownerController, 33) != 32) return false;
  Session next{};
  next.active = true;
  next.game = game;
  memcpy(next.id, sessionId, 16);
  memcpy(next.ownerToken, ownerToken, 32);
  memcpy(next.ownerController, ownerController, 32);
  next.lastOwnerMs = now;
  s = next;
  return true;
}

inline Role authenticate(const Session& s, const char* sessionId, const char* token,
                         const char* controllerId) {
  if (!s.active || !constantTimeEqual(s.id, sessionId, 16)) return Role::NONE;
  if (constantTimeEqual(s.ownerToken, token, 32) &&
      constantTimeEqual(s.ownerController, controllerId, 32)) return Role::OWNER;
  if (s.guestToken[0] && constantTimeEqual(s.guestToken, token, 32) &&
      constantTimeEqual(s.guestController, controllerId, 32)) return Role::GUEST;
  return Role::NONE;
}

inline bool grantGuest(Session& s, const char* sessionId, const char* ownerToken,
                       const char* ownerController, const char* guestToken,
                       const char* guestController, uint32_t now) {
  if (authenticate(s, sessionId, ownerToken, ownerController) != Role::OWNER ||
      !guestToken || !guestController || strnlen(guestToken, 33) != 32 ||
      strnlen(guestController, 33) != 32) return false;
  memcpy(s.guestToken, guestToken, 32);
  memcpy(s.guestController, guestController, 32);
  s.lastOwnerMs = now;
  s.lastGuestMs = now;
  s.guestJoined = false;
  return true;
}

inline bool revokeGuest(Session& s, const char* sessionId, const char* ownerToken,
                        const char* ownerController, uint32_t now) {
  if (authenticate(s, sessionId, ownerToken, ownerController) != Role::OWNER) return false;
  memset(s.guestToken, 0, sizeof(s.guestToken));
  memset(s.guestController, 0, sizeof(s.guestController));
  s.guestSequence = 0;
  s.lastGuestMs = 0;
  s.guestJoined = false;
  s.lastOwnerMs = now;
  return true;
}

inline bool heartbeat(Session& s, const char* sessionId, const char* token,
                      const char* controllerId, uint32_t now) {
  if (authenticate(s, sessionId, token, controllerId) != Role::OWNER ||
      (s.lastHeartbeatMs && (now-s.lastHeartbeatMs)<kHeartbeatIntervalMs)) return false;
  s.lastHeartbeatMs = now;s.lastOwnerMs = now;
  return true;
}

inline bool pollAllowed(Session& s,const char* sessionId,const char* token,
                        const char* controllerId,uint32_t now) {
  if(authenticate(s,sessionId,token,controllerId)!=Role::OWNER ||
     (s.lastPollMs && (now-s.lastPollMs)<kPollIntervalMs)) return false;
  s.lastPollMs=now;
  return true;
}

inline bool touchGuest(Session& s,const char* sessionId,const char* token,
                       const char* controllerId,uint32_t now) {
  if(authenticate(s,sessionId,token,controllerId)!=Role::GUEST) return false;
  s.guestJoined=true;s.lastGuestMs=now;
  return true;
}

inline bool pushAction(Session& s, const char* sessionId, const char* token,
                       const char* controllerId, uint32_t sequence,
                       Action action, uint32_t now) {
  const Role role = authenticate(s, sessionId, token, controllerId);
  if (role == Role::NONE || !sequence || (now - s.lastActionMs) < kInputIntervalMs) return false;
  if (role == Role::GUEST && action != Action::UP && action != Action::DOWN &&
      action != Action::LEFT && action != Action::RIGHT) return false;
  uint32_t& last = role == Role::OWNER ? s.ownerSequence : s.guestSequence;
  if (sequence <= last || s.actionCount == kActionQueueCapacity) return false;
  last = sequence;
  s.lastActionMs = now;
  if (role == Role::OWNER) s.lastOwnerMs = now;
  else s.lastGuestMs = now;
  const uint8_t index = static_cast<uint8_t>((s.actionHead + s.actionCount) % kActionQueueCapacity);
  s.actions[index].value = action;
  s.actions[index].sequence = sequence;
  s.actions[index].role = role;
  ++s.actionCount;
  return true;
}

inline bool popAction(Session& s, QueuedAction& out) {
  if (!s.actionCount) return false;
  out = s.actions[s.actionHead];
  s.actionHead = static_cast<uint8_t>((s.actionHead + 1) % kActionQueueCapacity);
  --s.actionCount;
  return true;
}

inline bool acceptFrame(Session& s, const char* sessionId, const char* token,
                        const char* controllerId, uint32_t sequence,
                        const uint8_t* rgb565, size_t length, uint32_t now) {
  if (authenticate(s, sessionId, token, controllerId) != Role::OWNER || !sequence ||
      sequence <= s.frameSequence || !rgb565 || length != kFrameBytes ||
      (now - s.lastFrameMs) < kFrameIntervalMs) return false;
  memcpy(s.frame, rgb565, kFrameBytes);
  s.hasFrame = true;
  s.frameSequence = sequence;
  s.lastFrameMs = now;
  s.lastOwnerMs = now;
  return true;
}

inline bool copyFrame(const Session& s, uint8_t* out, size_t length) {
  if (!s.active || !s.hasFrame || !out || length < kFrameBytes) return false;
  memcpy(out, s.frame, kFrameBytes);
  return true;
}

inline void exit(Session& s) { s = Session{}; }

inline bool expire(Session& s, uint32_t now) {
  if(s.active&&s.guestToken[0]&&s.guestJoined&&(now-s.lastGuestMs)>kGuestLeaseMs) {
    memset(s.guestToken,0,sizeof(s.guestToken));
    memset(s.guestController,0,sizeof(s.guestController));
    s.guestSequence=0;s.lastGuestMs=0;s.guestJoined=false;
  }
  if (s.active && ((now - s.lastOwnerMs) > kOwnerLeaseMs ||
      (s.hasFrame && (now - s.lastFrameMs) > kOwnerLeaseMs))) {
    exit(s);
    return true;
  }
  return false;
}

} // namespace hbnf_arcade
