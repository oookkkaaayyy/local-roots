#include <cassert>
#include <cstdio>
#include <cstring>
#include <cstdlib>
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

  // Motion changes phase rate, not rendering math.
  const uint32_t pSlow=advancePhaseQ16(20000,1000,0);
  const uint32_t pMid =advancePhaseQ16(20000,1000,50);
  const uint32_t pFast=advancePhaseQ16(20000,1000,100);
  assert(pSlow < pMid && pMid < pFast);
  assert((pMid-20000)==8000u);

  // Same state is deterministic: no hidden history.
  Rgb8 d1[22],d2[22];
  const auto f=makeFrame(987,54321,c,{140,90,40,100,true});
  renderAux22(f,d1); renderAux22(f,d2);
  assert(same(d1,d2,22));

  // Audio-response gain is literal and monotonic for the same source.
  uint32_t bassDelta[5]={0,0,0,0,0};
  const uint8_t levels[5]={0,25,50,75,100};
  for(int k=0;k<5;k++){
    Controls rc=c; rc.audioResponse=levels[k];
    Rgb8 base[22],hit[22];
    renderAux22(makeFrame(200,23456,rc,quiet),base);
    renderAux22(makeFrame(200,23456,rc,bass),hit);
    uint32_t d=0;
    for(int i=0;i<22;i++) d+=
      (uint32_t)abs((int)hit[i].r-(int)base[i].r)+
      (uint32_t)abs((int)hit[i].g-(int)base[i].g)+
      (uint32_t)abs((int)hit[i].b-(int)base[i].b);
    bassDelta[k]=d;
  }
  assert(bassDelta[0]==0);
  assert(bassDelta[1] < bassDelta[2]);
  assert(bassDelta[2] <= bassDelta[3]);
  assert(bassDelta[3] <= bassDelta[4]);

  // The 22 AUX locations are explicitly Matrix-perimeter coordinates.
  for(uint8_t i=0;i<22;i++){
    uint16_t x=99,y=99; perimeterCoord22(i,x,y);
    assert(x<=31 && y<=15);
    assert(x==0 || x==31 || y==0 || y==15);
  }

  // Anti-short-loop gate: one low-16-bit phase traversal later, the field
  // must not sample the exact same coordinates/palette state.
  const FieldCoords e0=fieldCoords(11,7,38,0x00001234u);
  const FieldCoords e1=fieldCoords(11,7,38,0x00011234u);
  assert(e0.z==e1.z);
  assert(e0.nx!=e1.nx);
  assert(e0.ny!=e1.ny);
  assert(e0.paletteDrift!=e1.paletteDrift);

  puts("PASS foundation-v1 core: literal controls, deterministic audio response, companion renderer, long-horizon field drift; brightness delegated to native WLED segments");
}
