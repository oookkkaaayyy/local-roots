#include <array>
#include <cassert>
#include <cmath>
#include <cstdio>
#include "hbnf_music_intelligence.h"

static hbnf::MusicSemantics frame(hbnf::MusicIntelligence &m, uint32_t at, int band, int vol, bool hit=false) {
  uint8_t fft[16]{}; const int a=band==0?0:(band==1?4:11), z=band==0?4:(band==1?11:16);
  for(int i=a;i<z;i++) fft[i]=(uint8_t)(hit?245:150);
  return m.update(fft,(float)(hit?255:vol),at);
}
int main(){
  hbnf::MusicIntelligence m; uint8_t zero[16]{}; m.update(zero,0,1);
  auto cough=frame(m,101,2,255,true); assert(cough.onsetEvent && !cough.tempoValid);
  hbnf::MusicSemantics bass{}; for(uint32_t t=201;t<8000;t+=100) bass=frame(m,t,0,160);
  assert(bass.bass>bass.treble); assert(bass.bassAccent>0); assert(bass.stableTempoBias==1.0f || bass.tempoValid);
  hbnf::MusicIntelligence slow; slow.update(zero,0,1); hbnf::MusicSemantics quiet{};
  for(uint32_t t=100;t<10000;t+=100) quiet=frame(slow,t,1,12);
  assert(!quiet.tempoValid); assert(quiet.vibe==hbnf::MUSIC_MELLOW || quiet.vibe==hbnf::MUSIC_MODERATE);
  hbnf::MusicIntelligence beater; beater.update(zero,0,1); hbnf::MusicSemantics beat{};
  for(uint32_t t=100;t<10000;t+=500) beat=frame(beater,t,0,100,true);
  assert(!beat.tempoValid); // spaced isolated claps do not qualify for stable tempo
  hbnf::MusicIntelligence steady; steady.update(zero,0,1); uint8_t fft[16]{}; hbnf::MusicSemantics out{};
  for(uint32_t t=100;t<15000;t+=20){ bool hit=((t-100)%500)<40; for(int i=0;i<4;i++)fft[i]=hit?220:105; out=steady.update(fft,hit?190:95,t); }
  assert(out.tempoValid); assert(out.stableTempoBpm>=110 && out.stableTempoBpm<=130);
  assert(std::isfinite(out.confidence)&&out.confidence>=0&&out.confidence<=1);
  puts("PASS semantic music analyzer: band separation, slow track, clap immunity, stable beat, bounded confidence");
}
