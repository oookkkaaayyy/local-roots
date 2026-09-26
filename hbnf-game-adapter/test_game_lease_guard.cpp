#include <cassert>
#include <cstdio>
#include "game_lease_guard.h"
using namespace hbnf_game;

static CanonicalSample good(uint64_t rev,uint8_t bri=8){
  CanonicalSample s; s.reachable=true; s.powerOn=true; s.matrixOnline=true;
  s.brightness=bri; s.revision=rev; s.observedRevision=rev; return s;
}

int main(){
  LeaseGuard g;
  g.requestStart(1000); assert(!g.mayStream());
  auto s=good(9,23); g.controllerHeartbeat(1000); g.ingestCanonical(s,1000);
  assert(g.mayStream() && g.canonicalBrightness()==23);

  s.brightness=2; s.revision=10; s.observedRevision=10; g.ingestCanonical(s,1100);
  assert(g.mayStream() && g.canonicalBrightness()==2);

  s.powerOn=false; s.revision=11; s.observedRevision=11; g.ingestCanonical(s,1150);
  assert(!g.mayStream() && g.stopReason()==StopReason::CanonicalOff);

  g.requestStart(2000); s=good(20); s.observedRevision=19; g.controllerHeartbeat(2000);
  g.ingestCanonical(s,2000);
  assert(!g.mayStream() && g.stopReason()==StopReason::MatrixOffline);

  g.requestStart(3000); s=good(21); g.controllerHeartbeat(3000); g.ingestCanonical(s,3000);
  assert(g.mayStream()); g.tick(4201);
  assert(!g.mayStream() && g.stopReason()==StopReason::CanonicalStale);

  g.requestStart(5000); g.controllerHeartbeat(5000); s=good(22);
  g.ingestCanonical(s,5000); g.ingestCanonical(s,7100); g.tick(7201);
  assert(!g.mayStream() && g.stopReason()==StopReason::ControllerLost);

  g.requestStart(8000); g.controllerHeartbeat(8000); s=good(23); g.ingestCanonical(s,8000);
  assert(g.mayStream()); g.userExit();
  assert(!g.mayStream() && g.stopReason()==StopReason::UserExit);

  std::puts("PASS: HBNF game realtime lease guard");
}
