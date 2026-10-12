#include <assert.h>
#include <stdint.h>
#include <string.h>
#include "../firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_arcade_session_protocol.h"

using namespace hbnf_arcade;

int main() {
  Session s{};
  assert(!start(s, 1, "0123456789abcdef", "11111111111111111111111111111111",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1234", "", 100));
  assert(!start(s, 1, "0123456789abcdef", "11111111111111111111111111111111",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "9999", "1234", 100));
  assert(start(s, 1, "0123456789abcdef", "11111111111111111111111111111111",
               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1234", "1234", 100));

  assert(authenticate(s, "wrong-session-id", s.ownerToken, s.ownerController) == Role::NONE);
  assert(authenticate(s, s.id, "wrong-token", s.ownerController) == Role::NONE);
  assert(!grantGuest(s, s.id, "wrong-token", s.ownerController,
                     "22222222222222222222222222222222",
                     "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 120));
  assert(grantGuest(s, s.id, s.ownerToken, s.ownerController,
                    "22222222222222222222222222222222",
                    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 120));

  // Guest authority is explicit and restricted to directional play.
  assert(!pushAction(s, s.id, s.guestToken, s.guestController, 1, Action::EXIT, 200));
  assert(pushAction(s, s.id, s.guestToken, s.guestController, 1, Action::LEFT, 200));
  assert(!pushAction(s, s.id, s.guestToken, s.guestController, 1, Action::LEFT, 260));
  QueuedAction action{};
  assert(popAction(s, action) && action.value == Action::LEFT && action.role == Role::GUEST);
  assert(!popAction(s, action));

  // Guest traffic cannot keep the owner's lease alive.
  assert(!expire(s, 2119));
  assert(expire(s, 2121));
  assert(!s.active);

  assert(start(s, 2, "0123456789abcdef", "11111111111111111111111111111111",
               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1234", "1234", 3000));
  assert(grantGuest(s, s.id, s.ownerToken, s.ownerController,
                    "22222222222222222222222222222222",
                    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 3010));
  assert(touchGuest(s,s.id,s.guestToken,s.guestController,3020));
  assert(pollAllowed(s,s.id,s.ownerToken,s.ownerController,3030));
  assert(!pollAllowed(s,s.id,s.ownerToken,s.ownerController,3079));
  assert(pollAllowed(s,s.id,s.ownerToken,s.ownerController,3080));
  assert(revokeGuest(s, s.id, s.ownerToken, s.ownerController, 3020));
  assert(authenticate(s, s.id, "22222222222222222222222222222222",
                      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") == Role::NONE);

  uint8_t pixels[kFrameBytes]{};
  pixels[12] = 0x7f;
  assert(!acceptFrame(s, s.id, s.guestToken, s.guestController, 1, pixels, sizeof(pixels), 3100));
  assert(!acceptFrame(s, s.id, s.ownerToken, s.ownerController, 1, pixels, sizeof(pixels)-1, 3100));
  assert(acceptFrame(s, s.id, s.ownerToken, s.ownerController, 1, pixels, sizeof(pixels), 3100));
  uint8_t copied[kFrameBytes]{};
  assert(copyFrame(s, copied, sizeof(copied)) && copied[12] == 0x7f);
  assert(!acceptFrame(s,s.id,s.ownerToken,s.ownerController,2,pixels,sizeof(pixels),3120));
  assert(acceptFrame(s,s.id,s.ownerToken,s.ownerController,2,pixels,sizeof(pixels),3150));
  assert(!acceptFrame(s, s.id, s.ownerToken, s.ownerController, 1, pixels, sizeof(pixels), 3200));
  assert(!acceptFrame(s, "wrong-session-id", s.ownerToken, s.ownerController, 3, pixels, sizeof(pixels), 3200));
  assert(heartbeat(s, s.id, s.ownerToken, s.ownerController, 4000));
  assert(!heartbeat(s,s.id,s.ownerToken,s.ownerController,4100));
  assert(heartbeat(s,s.id,s.ownerToken,s.ownerController,4250));
  // Heartbeats alone cannot leave a stale frame displayed indefinitely.
  assert(!expire(s, 5150));
  assert(expire(s, 5151));
  assert(!s.active);

  assert(start(s,1,"0123456789abcdef","11111111111111111111111111111111",
               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","1234","1234",7000));
  assert(grantGuest(s,s.id,s.ownerToken,s.ownerController,
                    "22222222222222222222222222222222",
                    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",7010));
  assert(touchGuest(s,s.id,s.guestToken,s.guestController,7020));
  assert(heartbeat(s,s.id,s.ownerToken,s.ownerController,7020+kGuestLeaseMs-100));
  assert(!expire(s,7020+kGuestLeaseMs+1)); // guest expires, owner session remains active
  assert(s.active && authenticate(s,s.id,"22222222222222222222222222222222",
                                  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")==Role::NONE);
}
