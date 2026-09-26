#pragma once
#include <cstdint>

namespace hbnf_game {

enum class StopReason : uint8_t {
  None, UserExit, CanonicalOff, MatrixOffline, CanonicalStale, ControllerLost,
};

struct CanonicalSample {
  bool reachable=false;
  bool powerOn=false;
  bool matrixOnline=false;
  uint8_t brightness=0;
  uint64_t revision=0;
  uint64_t observedRevision=0;
};

class LeaseGuard {
 public:
  static constexpr uint64_t kCanonicalStaleMs=1200;
  static constexpr uint64_t kControllerGraceMs=2200;

  void requestStart(uint64_t nowMs) {
    requested_=true; streaming_=false; stopReason_=StopReason::None; lastControllerMs_=nowMs;
  }
  void controllerHeartbeat(uint64_t nowMs) { lastControllerMs_=nowMs; }

  void ingestCanonical(const CanonicalSample& s, uint64_t nowMs) {
    lastSample_=s; lastCanonicalMs_=nowMs; haveCanonical_=true;
    if (!requested_) return;
    if (!s.reachable || !s.powerOn) {
      stop(s.reachable ? StopReason::CanonicalOff : StopReason::CanonicalStale); return;
    }
    if (!s.matrixOnline || s.observedRevision < s.revision) {
      stop(StopReason::MatrixOffline); return;
    }
    streaming_=true;
  }

  void tick(uint64_t nowMs) {
    if (!requested_) return;
    if (!haveCanonical_ || nowMs-lastCanonicalMs_ > kCanonicalStaleMs) {
      stop(StopReason::CanonicalStale); return;
    }
    if (nowMs-lastControllerMs_ > kControllerGraceMs) stop(StopReason::ControllerLost);
  }

  void userExit() { stop(StopReason::UserExit); }
  bool mayStream() const {
    return requested_ && streaming_ && haveCanonical_ && lastSample_.reachable &&
      lastSample_.powerOn && lastSample_.matrixOnline &&
      lastSample_.observedRevision >= lastSample_.revision;
  }
  StopReason stopReason() const { return stopReason_; }
  uint8_t canonicalBrightness() const { return lastSample_.brightness; }

 private:
  void stop(StopReason why) { requested_=false; streaming_=false; stopReason_=why; }
  bool requested_=false, streaming_=false, haveCanonical_=false;
  uint64_t lastCanonicalMs_=0, lastControllerMs_=0;
  CanonicalSample lastSample_{};
  StopReason stopReason_=StopReason::None;
};

} // namespace hbnf_game
