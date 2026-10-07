#include <array>
#include <cassert>
#include <cstdint>
#include "../firmware/phase2/brightness-r1/hbnf_brightness_output.h"

struct Rgb8 {
  uint8_t r, g, b;
  Rgb8(uint8_t red=0, uint8_t green=0, uint8_t blue=0): r(red), g(green), b(blue) {}
  bool operator==(const Rgb8& other) const { return r==other.r && g==other.g && b==other.b; }
};

static bool same(const Rgb8& a, const Rgb8& b) {
  return a.r==b.r && a.g==b.g && a.b==b.b;
}

int main() {
  std::array<Rgb8,512> canonical{};
  for (uint16_t i=0;i<canonical.size();++i) {
    if (i%17u) canonical[i]=Rgb8((uint8_t)(i%256u),(uint8_t)((i*37u)%256u),(uint8_t)((i*73u)%256u));
  }
  const auto frozenCanonical=canonical;
  const uint8_t levels[]={0,1,8,20,64,128,255};
  std::array<Rgb8,512> prior{};
  for (uint8_t level: levels) {
    const uint8_t scale=hbnf_brightness::outputScale(level);
    assert(scale==level);
    uint16_t participation=0;
    for (uint16_t i=0;i<canonical.size();++i) {
      // The production source gamma-corrects canonical RGB before passing it
      // here; identity is used to isolate the final brightness transform.
      const Rgb8 output=hbnf_brightness::scaleOutputPixel(canonical[i],canonical[i],scale);
      if (level==0) assert(output.r==0 && output.g==0 && output.b==0);
      if (level && (canonical[i].r||canonical[i].g||canonical[i].b)) {
        assert(output.r||output.g||output.b);
        ++participation;
      }
      if (level==255) assert(same(output,canonical[i]));
      assert(output.r>=prior[i].r && output.g>=prior[i].g && output.b>=prior[i].b);
      prior[i]=output;
    }
    if (level) {
      uint16_t expected=0;
      for (const auto& pixel:canonical) if(pixel.r||pixel.g||pixel.b) ++expected;
      assert(participation==expected);
    }
    assert(canonical==frozenCanonical);
  }

  const Rgb8 darkCanonical(1,2,3), gammaBlack(0,0,0);
  const Rgb8 retained=hbnf_brightness::scaleOutputPixel(gammaBlack,darkCanonical,1);
  assert(retained.r||retained.g||retained.b);
}
