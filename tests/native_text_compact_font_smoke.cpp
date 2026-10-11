#include <cassert>
#include <cstring>

#include "../firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_native_text.h"
#include "../firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_coordinated_contract.h"

struct MockFontManager {
  uint8_t slot=4;
  uint8_t getFontSpacing() { return 1; }
  uint8_t getFontHeight() { return slot==0 ? 6 : (slot==4 ? 12 : 8); }
  bool loadFont(uint8_t requested,const char*,bool) {
    if(requested!=0 && requested!=2 && requested!=3 && requested!=4) return false;
    slot=requested;
    return true;
  }
  uint8_t getGlyphWidth(uint32_t code) {
    if(slot==0) return 3; // pinned WLED Tom Thumb 6px WBF is fixed-width
    if(code==' ') return 2;
    if(code=='I'||code=='L') return 3;
    if(code=='J') return 4;
    return 5;
  }
  void drawCharacter(uint32_t,int16_t,int16_t,uint32_t,uint32_t,int8_t) {}
};

int main() {
  MockFontManager font{};
  assert(HbnfNativeText::resolveFontIndex(font,4,"ACE",32)==4);
  assert(font.slot==4);

  assert(HbnfNativeText::resolveFontIndex(font,4,"ANDREW",32)==0);
  assert(font.slot==0);
  assert(HbnfNativeText::textWidth(font,"ANDREW")==23);

  assert(HbnfNativeText::resolveFontIndex(font,4,"NEXT PLAYER UP",32)==0);
  assert(font.slot==0);
  char page[64]{};
  assert(HbnfNativeText::packPage(font,"NEXT PLAYER UP",0,page)==3);
  assert(std::strcmp(page,"NEXT")==0);
  assert(HbnfNativeText::packPage(font,"NEXT PLAYER UP",1,page)==3);
  assert(std::strcmp(page,"PLAYER")==0);

  assert(HbnfNativeText::resolveFontIndex(font,4,"SUPERCALIFRAGILISTIC",32)==4);
  assert(font.slot==4); // retain the selected face if even the compact face overflows

  hbnf_v1::OverlayState overlay{};
  assert(!overlay.fontFitResolved);
  hbnf_v1::setTextOverlay(overlay,"name-1","ANDREW",8000,255,255,255,100,4);
  assert(!overlay.fontFitResolved); // a new overlay resolves once on its first render
}
