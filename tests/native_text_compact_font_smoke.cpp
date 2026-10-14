#include <cassert>
#include <cstdio>
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
  assert(HbnfNativeText::packPage(font,"HeLLo",0,page)==1);
  assert(std::strcmp(page,"HeLLo")==0);
  assert(HbnfNativeText::centeredTextX(32,28)==2); // round the half-pixel tie right
  assert(HbnfNativeText::centeredTextX(32,27)==3);

  assert(HbnfNativeText::resolveFontIndex(font,4,"SUPERCALIFRAGILISTIC",32)==4);
  assert(font.slot==4); // retain the selected face if even the compact face overflows

  hbnf_v1::OverlayState overlay{};
  assert(!overlay.fontFitResolved);
  hbnf_v1::setTextOverlay(overlay,"name-1","ANDREW",8000,255,255,255,100,4);
  assert(!overlay.fontFitResolved); // a new overlay resolves once on its first render

  const char* scores[hbnf_v1::kOwnerScoreboardMaxEntries]{};
  char rows[hbnf_v1::kOwnerScoreboardMaxEntries][8]{};
  for(uint8_t i=0;i<hbnf_v1::kOwnerScoreboardMaxEntries;i++){
    std::snprintf(rows[i],sizeof(rows[i]),"P%u %u",(unsigned)(i+1u),(unsigned)(i%10u));
    scores[i]=rows[i];
  }
  hbnf_v1::setScoreboardOverlay(overlay,"all-20","F9",scores,
    hbnf_v1::kOwnerScoreboardMaxEntries,110000u,1000u);
  assert(overlay.entryCount==20);
  assert(std::strcmp(overlay.entries[0],"P1 0")==0);
  assert(std::strcmp(overlay.entries[19],"P20 9")==0);
  assert(hbnf_v1::overlayVisible(overlay,1000u+109999u));
  assert(!hbnf_v1::overlayVisible(overlay,1000u+110000u));
  assert(hbnf_v1::kOwnerScoreboardPageDwellMs==5500u);
}
