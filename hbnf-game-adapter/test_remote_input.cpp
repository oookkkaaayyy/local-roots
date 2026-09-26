#include "remote_input.h"
#include <cassert>
#include <iostream>
using namespace hbnf_game;

int main() {
  RemoteInputBroker r;
  assert(r.claim(1,0,false,100,false)==RemoteInputBroker::Claim::Ok);
  assert(r.claim(2,0,false,101,false)==RemoteInputBroker::Claim::Busy);
  assert(r.update(1,0,1|16,120));
  auto p=r.pad(0,120);
  assert(p.connected && p.up && p.a && !p.down);
  assert(!r.privileged(0,120));
  assert(r.claim(1,1,true,130,false)==RemoteInputBroker::Claim::Ok);
  assert(r.owner(0,130)==-1 && r.owner(1,130)==1 && r.privileged(1,130));
  r.preempt(1);
  assert(r.owner(1,131)==-1);
  assert(r.claim(2,0,false,200,true)==RemoteInputBroker::Claim::Busy);
  assert(r.claim(2,0,false,200,false)==RemoteInputBroker::Claim::Ok);
  assert(r.owner(0,200)==2);
  r.expire(200 + RemoteInputBroker::kLeaseMs + 1);
  assert(r.owner(0,200 + RemoteInputBroker::kLeaseMs + 1)==-1);
  std::cout << "HBNF_REMOTE_INPUT_BROKER_TEST=PASS\n";
}
