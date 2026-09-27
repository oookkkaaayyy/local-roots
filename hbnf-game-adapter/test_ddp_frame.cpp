#include <cassert>
#include <cstdint>
#include <cstdio>
#include "ddp_frame.h"

using namespace hbnf_game;

static uint32_t be32(const uint8_t* p) {
  return (uint32_t(p[0])<<24)|(uint32_t(p[1])<<16)|(uint32_t(p[2])<<8)|uint32_t(p[3]);
}
static uint16_t be16(const uint8_t* p) {
  return uint16_t((uint16_t(p[0])<<8)|uint16_t(p[1]));
}

int main() {
  Framebuffer fb;
  for (int y=0;y<kHeight;++y) {
    for (int x=0;x<kWidth;++x) {
      fb.set(x,y,RGB(uint8_t(x*7),uint8_t(y*13),uint8_t((x+y)*5)));
    }
  }
  assert(fb.rejectedWrites==0);

  uint8_t seq=0;
  auto packets=encodeDdp(fb,seq);
  assert(packets.size()==2);

  const auto& a=packets[0].bytes;
  const auto& b=packets[1].bytes;
  assert(a.size()==10+1440);
  assert(b.size()==10+96);
  assert(a[0]==kDdpVersion1);
  assert(b[0]==uint8_t(kDdpVersion1|kDdpPush));
  assert(a[2]==kDdpTypeRgb24 && b[2]==kDdpTypeRgb24);
  assert(a[3]==kDdpDisplayId && b[3]==kDdpDisplayId);
  assert(be32(&a[4])==0);
  assert(be32(&b[4])==1440);
  assert(be16(&a[8])==1440);
  assert(be16(&b[8])==96);

  // Pixel 0 and final pixel must survive encoding exactly.
  assert(a[10]==0 && a[11]==0 && a[12]==0);
  const uint32_t c=fb.px.back();
  assert(b[b.size()-3]==uint8_t((c>>16)&0xFF));
  assert(b[b.size()-2]==uint8_t((c>>8)&0xFF));
  assert(b[b.size()-1]==uint8_t(c&0xFF));

  // 10,000 complete frames: sequence stays bounded and packet geometry stable.
  for (int i=0;i<10000;++i) {
    auto q=encodeDdp(fb,seq);
    assert(q.size()==2);
    assert(q[0].bytes.size()==1450);
    assert(q[1].bytes.size()==106);
    assert((q[1].bytes[0]&kDdpPush)!=0);
    assert(seq<=15);
  }

  // Allocation-free path used by the ESP32 runtime: soak 100,000 frames and
  // verify identical packet geometry without constructing std::vector packets.
  DdpFixedFrame fixed;
  uint8_t fixedSeq=0;
  for (int i=0;i<100000;++i) {
    encodeDdpFixed(fb,fixedSeq,fixed);
    assert(fixed.count==2);
    assert(fixed.packets[0].length==1450);
    assert(fixed.packets[1].length==106);
    assert((fixed.packets[1].bytes[0]&kDdpPush)!=0);
    assert(fixedSeq<=15);
  }
  assert(fixed.packets[0].bytes[10]==0 &&
         fixed.packets[0].bytes[11]==0 &&
         fixed.packets[0].bytes[12]==0);
  assert(fixed.packets[1].bytes[fixed.packets[1].length-3]==uint8_t((c>>16)&0xFF));
  assert(fixed.packets[1].bytes[fixed.packets[1].length-2]==uint8_t((c>>8)&0xFF));
  assert(fixed.packets[1].bytes[fixed.packets[1].length-1]==uint8_t(c&0xFF));

  std::printf("PASS: HBNF DDP 32x16 encoders; allocation-free runtime path soaked 100000 frames on UDP %u\n", kDdpPort);
}
