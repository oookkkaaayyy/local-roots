#include <stdint.h>
#include <assert.h>
#include <string.h>
#define PROGMEM
#define pgm_read_byte(p) (*(const uint8_t*)(p))
#include "../firmware/phase2/text-native-r1/hbnf_native_text.h"

struct TestSegment {
  uint32_t pixels[32*16]{};
  void setPixelColorXY(int x,int y,uint32_t c) {
    if(x>=0&&x<32&&y>=0&&y<16)pixels[y*32+x]=c;
  }
};
int main() {
  TestSegment s{};
  const auto f=HbnfNativeText::font5x12();
  assert(f.height==12&&f.width==5&&f.spacing==1);
  assert(HbnfNativeText::textWidth(f,"ACE")<=32);
  HbnfNativeText::drawCentered(s,f,"ACE",32,16,0x123456);
  bool visible=false;for(auto p:s.pixels)visible|=p==0x123456;assert(visible);
  char page[64]{};
  const auto pages=HbnfNativeText::packPage(f,"NEXT PLAYER UP",0,page);
  assert(pages==3&&strcmp(page,"NEXT")==0);
  HbnfNativeText::packPage(f,"NEXT PLAYER UP",1,page);assert(strcmp(page,"PLAYER")==0);
  HbnfNativeText::packPage(f,"NEXT PLAYER UP",2,page);assert(strcmp(page,"UP")==0);
  TestSegment paged{};HbnfNativeText::drawPaged(paged,f,"NEXT PLAYER UP",2300,32,16,0xFEDCBA);
  visible=false;for(auto p:paged.pixels)visible|=p==0xFEDCBA;assert(visible);
  const TestSegment before=s;
  HbnfNativeText::drawCentered(s,f,"",32,16,0xFFFFFF);
  assert(memcmp(&s,&before,sizeof(s))==0);
  TestSegment compact{};
  const auto f6=HbnfNativeText::font6x8();
  assert(f6.height==8&&f6.width==6);
  HbnfNativeText::drawCentered(compact,f6,"ACE",32,16,0xABCDEF);
  visible=false;for(auto p:compact.pixels)visible|=p==0xABCDEF;assert(visible);
}
