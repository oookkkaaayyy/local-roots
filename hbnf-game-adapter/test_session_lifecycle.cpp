#include <cassert>
#include <cstdio>
#include "session_lifecycle.h"
using namespace hbnf_game;

int main(){
  SessionLifecycle s;
  assert(s.update(true,true,1000)==SessionEvent::None);
  assert(s.update(true,true,1799)==SessionEvent::None);
  assert(s.update(true,true,1800)==SessionEvent::Start);
  assert(s.active());

  // Hold must be released before another action can fire.
  assert(s.update(true,true,4000)==SessionEvent::None);
  assert(s.update(false,true,4010)==SessionEvent::None);

  // In an actual game, START+SELECT is reserved for GameManager's 0.8s back-to-menu.
  assert(s.update(true,false,5000)==SessionEvent::None);
  assert(s.update(true,false,8000)==SessionEvent::None);
  assert(s.active());
  assert(s.update(false,false,8010)==SessionEvent::None);

  // From menu, 2.0s exits the whole realtime session.
  assert(s.update(true,true,9000)==SessionEvent::None);
  assert(s.update(true,true,10999)==SessionEvent::None);
  assert(s.update(true,true,11000)==SessionEvent::End);
  assert(!s.active());

  s.update(false,true,11010);
  s.update(true,true,12000);
  s.update(true,true,12800);
  assert(s.active());
  s.forceEnd();
  assert(!s.active());
  std::puts("PASS: HBNF game session lifecycle");
}
