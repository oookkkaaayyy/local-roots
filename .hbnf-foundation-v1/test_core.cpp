#include <cassert>
#include <cstdio>
#include <cstring>
#include "hbnf_foundation_core.h"

using namespace hbnf_v1;

static uint32_t sum(const Rgb8* p,size_t n){
  uint32_t s=0; for(size_t i=0;i<n;i++) s+=p[i].r+p[i].g+p[i].b; return s;
}

static bool same(const Rgb8* a,const Rgb8* b,size_t n){
  return std::memcmp(a,b,sizeof(Rgb8)*n)==0;
}

int main(){
  assert(audioGainQ8(0)==0);
  assert(audioGainQ8(50)==256);
  assert(audioGainQ8(100)==512);
  assert(motionQ8(0)==128);
  assert(motionQ8(50)==256);
  assert(motionQ8(100)==384);

  Controls c;
  AudioFrame quiet{};
  Rgb8 q[22];
  renderAux22(makeFrame(100,12345,c,quiet),q);

  AudioFrame bass{}; bass.bass=220;
  Rgb8 b[22];
  renderAux22(makeFrame(100,12345,c,bass),b);
  assert(sum(b,22)>sum(q,22));

  AudioFrame mids{}; mids.mid=220;
  Rgb8 m[22];
  renderAux22(makeFrame(100,12345,c,mids),m);
  assert(!same(q,m,22));

  AudioFrame high{}; high.treble=255;
  Rgb8 h[22];
  renderAux22(makeFrame(100,12345,c,high),h);
  assert(!same(q,h,22));

  Controls off=c; off.audioResponse=0;
  Rgb8 a0[22],a1[22];
  renderAux22(makeFrame(100,12345,off,quiet),a0);
  renderAux22(makeFrame(100,12345,off,bass),a1);
  assert(same(a0,a1,22));

  Controls slow=c; slow.motion=0;
  Controls fast=c; fast.motion=100;
  Rgb8 rs[22],rf[22];
  renderAux22(makeFrame(100,20000,slow,quiet),rs);
  renderAux22(makeFrame(100,20000,fast,quiet),rf);
  assert(!same(rs,rf,22));

  // Same state is deterministic: no hidden history.
  Rgb8 d1[22],d2[22];
  const auto f=makeFrame(987,54321,c,{140,90,40,100,true});
  renderAux22(f,d1); renderAux22(f,d2);
  assert(same(d1,d2,22));

  puts("PASS foundation-v1 core: literal controls, deterministic audio response, companion renderer; brightness delegated to native WLED segments");
}
