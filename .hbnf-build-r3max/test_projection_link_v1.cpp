#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include "hbnf_projection_link_v1.h"

int main(){
  using namespace hbnf;
  ProjectionAccumulator a;
  // 32x16 synthetic gradient; every perimeter group in the 5/6/5/6 cart geometry must map.
  for(uint16_t y=0;y<16;y++) for(uint16_t x=0;x<32;x++)
    a.add(x,y,32,16,(uint8_t)(x*7),(uint8_t)(y*11),(uint8_t)((x+y)*5));
  uint8_t rgb[PROJECTION_PIXELS*3];
  assert(a.finalize(rgb));
  int nonzero=0;
  for(int i=0;i<PROJECTION_PIXELS;i++) if(rgb[i*3]||rgb[i*3+1]||rgb[i*3+2]) nonzero++;
  assert(nonzero==22);

  uint8_t pkt[PROJECTION_PACKET_BYTES];
  assert(encodeProjectionPacket(513,rgb,pkt)==PROJECTION_PACKET_BYTES);
  uint8_t decoded[PROJECTION_PIXELS*3]; uint16_t seq=0;
  assert(decodeProjectionPacket(pkt,sizeof(pkt),seq,decoded));
  assert(seq==513);
  assert(std::memcmp(rgb,decoded,sizeof(rgb))==0);

  pkt[23]^=0x40;
  assert(!decodeProjectionPacket(pkt,sizeof(pkt),seq,decoded)); // CRC catches damage

  uint8_t r=20,g=10,b=5; projectionLiftLuma(r,g,b);
  assert(r>=70 && r>g && g>b);
  r=g=b=0; projectionLiftLuma(r,g,b); assert(r==0&&g==0&&b==0);

  puts("PASS projection-link-v1: 5/6/5/6 perimeter projection + CRC + luma");
}
