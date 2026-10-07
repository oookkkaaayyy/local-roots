#include <stdint.h>
#include <assert.h>
#include <string.h>
#include <string>
#include <vector>

#include "../firmware/phase2/text-native-r1/hbnf_native_text.h"

struct MockFontManager {
  uint32_t pixels[32*16]{};
  std::vector<std::string> drawn;
  uint8_t getFontHeight() { return 12; }
  uint8_t getFontSpacing() { return 1; }
  uint8_t getGlyphWidth(uint32_t code) {
    switch(code) {
      case ' ': return 2; case 'I': return 3; case 'L': return 3;
      case 'J': return 4; case 'M': case 'W': return 5;
      default: return 5;
    }
  }
  void drawCharacter(uint32_t code,int16_t x,int16_t y,uint32_t color,uint32_t,int8_t) {
    drawn.emplace_back(1,static_cast<char>(code));
    if (code != ' ' && x >= 0 && x < 32 && y >= 0 && y < 16)
      pixels[y*32+x] = color;
  }
};

int main() {
  MockFontManager font{};
  assert(HbnfNativeText::textWidth(font,"ACE") <= 32);
  char page[64]{};
  const auto pages=HbnfNativeText::packPage(font,"NEXT PLAYER UP",0,page);
  assert(pages==3 && strcmp(page,"NEXT")==0);
  HbnfNativeText::packPage(font,"NEXT PLAYER UP",1,page); assert(strcmp(page,"PLAYER")==0);
  HbnfNativeText::packPage(font,"NEXT PLAYER UP",2,page); assert(strcmp(page,"UP")==0);

  // Native FontManager draws only set glyph pixels; the underlying Vibe frame
  // remains intact wherever a glyph does not write.
  for (auto& pixel : font.pixels) pixel=0x102030;
  HbnfNativeText::drawPaged(font,"NEXT PLAYER UP",2300,32,16,0xFEDCBA);
  assert(!font.drawn.empty());
  bool preserved=false,drawn=false;
  for (auto pixel : font.pixels) {
    preserved |= pixel==0x102030;
    drawn |= pixel==0xFEDCBA;
  }
  assert(preserved && drawn);

  const auto before=font.drawn.size();
  HbnfNativeText::drawPaged(font,"",0,32,16,0xFFFFFF);
  assert(font.drawn.size()==before);
}
