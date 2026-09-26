#pragma once
#include <cstdint>

namespace hbnf_game {

enum class SessionEvent : uint8_t { None, Start, End };

class SessionLifecycle {
 public:
  static constexpr uint64_t kStartHoldMs=800;
  static constexpr uint64_t kEndHoldMs=2000;

  SessionEvent update(bool comboHeld,bool gameAtMenu,uint64_t nowMs){
    if(!comboHeld){
      holdSince_=0;
      latched_=false;
      return SessionEvent::None;
    }
    if(latched_) return SessionEvent::None;
    if(!holdSince_) holdSince_=nowMs;

    const uint64_t need=active_ && gameAtMenu ? kEndHoldMs : (!active_ ? kStartHoldMs : UINT64_MAX);
    if(need!=UINT64_MAX && nowMs-holdSince_>=need){
      active_=!active_;
      latched_=true;
      holdSince_=0;
      return active_ ? SessionEvent::Start : SessionEvent::End;
    }
    return SessionEvent::None;
  }

  void forceStart(){ active_=true; holdSince_=0; latched_=true; }
  void forceEnd(){ active_=false; holdSince_=0; latched_=true; }
  bool active() const { return active_; }

 private:
  bool active_=false;
  bool latched_=false;
  uint64_t holdSince_=0;
};

} // namespace hbnf_game
