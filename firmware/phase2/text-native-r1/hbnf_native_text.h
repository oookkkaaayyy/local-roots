#pragma once
// HBNF Text/VisualMoment raster adapter for the pinned WLED 16.0.1 native
// WBF fonts. Include after wled.h; source font headers remain upstream-owned.
#include "src/font/font_5x12.h"
#include "src/font/console_font_6x8.h"
#include <string.h>

namespace HbnfNativeText {
struct FontView {
  const uint8_t* bytes;
  uint8_t height, width, spacing, flags, first, last;
};

static inline FontView font5x12() {
  return {font_5x12,12,5,1,1,32,126};
}
static inline FontView font6x8() {
  return {console_font_6x8,8,6,1,1,32,126};
}
static inline uint8_t read(const uint8_t* p) { return pgm_read_byte(p); }

static inline uint8_t glyphWidth(const FontView& f, uint8_t code) {
  if (code < f.first || code > f.last) code='?';
  return f.flags & 1 ? read(f.bytes + 12 + (code-f.first)) : f.width;
}

static inline uint16_t glyphOffset(const FontView& f, uint8_t code) {
  if (code < f.first || code > f.last) code='?';
  uint16_t offset=0;
  for(uint8_t i=0;i<(uint8_t)(code-f.first);i++) {
    const uint8_t w=(f.flags&1)?read(f.bytes+12+i):f.width;
    offset=(uint16_t)(offset+((uint16_t)w*f.height+7u)/8u);
  }
  return offset;
}

static inline uint16_t textWidth(const FontView& f,const char* text) {
  if(!text||!*text)return 0;
  uint16_t width=0;uint8_t count=0;
  for(const uint8_t* p=(const uint8_t*)text;*p;p++) {
    const uint8_t code=(*p>=32&&*p<=126)?*p:'?';
    if(count++)width=(uint16_t)(width+f.spacing);
    width=(uint16_t)(width+glyphWidth(f,code));
  }
  return width;
}
static inline void copyText(char* out,const char* in,size_t capacity) {
  if(!capacity)return;size_t i=0;
  if(in)while(i+1<capacity&&in[i]){out[i]=in[i];i++;}
  out[i]='\0';
}

template<class SegmentT>
static inline void draw(SegmentT& segment,const FontView& f,const char* text,
                        int16_t x,int16_t y,uint32_t color) {
  if(!text||!*text)return; // no-text path: no font scan and no frame mutation
  for(const uint8_t* p=(const uint8_t*)text;*p;p++) {
    const uint8_t code=(*p>=32&&*p<=126)?*p:'?';
    const uint8_t width=glyphWidth(f,code);
    const uint8_t* bitmap=f.bytes+12+((f.flags&1)?(f.last-f.first+1):0)+glyphOffset(f,code);
    uint16_t bit=0;
    for(uint8_t row=0;row<f.height;row++)for(uint8_t col=0;col<width;col++,bit++) {
      const uint8_t value=read(bitmap+(bit>>3));
      if((value>>(7-(bit&7)))&1u)segment.setPixelColorXY(x+col,y+row,color);
    }
    x=(int16_t)(x+width+f.spacing);
  }
}

template<class SegmentT>
static inline void drawCentered(SegmentT& segment,const FontView& f,const char* text,
                                uint8_t canvasWidth,uint8_t canvasHeight,uint32_t color) {
  if(!text||!*text)return;
  const int16_t x=(int16_t)(canvasWidth-textWidth(f,text))/2;
  const int16_t y=(int16_t)(canvasHeight-f.height)/2;
  draw(segment,f,text,x,y,color);
}

static inline uint8_t packPage(const FontView& f,const char* text,uint8_t wanted,char out[64]) {
  char current[64]{};uint8_t page=0;size_t pos=0;const size_t length=text?strlen(text):0;
  while(pos<length) {
    while(pos<length&&(text[pos]==' '||text[pos]=='\n'||text[pos]=='\r'||text[pos]=='\t'))pos++;
    if(pos>=length)break;
    char word[64]{};size_t n=0;
    while(pos<length&&text[pos]!=' '&&text[pos]!='\n'&&text[pos]!='\r'&&text[pos]!='\t'&&n<63) {
      char c=text[pos++];word[n++]=(c>='a'&&c<='z')?(char)(c-'a'+'A'):c;
    }
    while(pos<length&&text[pos]!=' '&&text[pos]!='\n'&&text[pos]!='\r'&&text[pos]!='\t')pos++;
    word[n]='\0';
    char joined[64]{};copyText(joined,current,sizeof(joined));
    const size_t used=strlen(joined);
    if(used&&used<62){joined[used]=' ';copyText(joined+used+1,word,sizeof(joined)-used-1);}
    else copyText(joined,word,sizeof(joined));
    if(*current&&textWidth(f,joined)>32) {
      if(page==wanted)copyText(out,current,64);
      page++;current[0]='\0';copyText(current,word,sizeof(current));
    } else copyText(current,joined,sizeof(current));
  }
  if(*current){if(page==wanted)copyText(out,current,64);page++;}
  if(!page){if(wanted==0)out[0]='\0';return 1;}
  return page;
}

template<class SegmentT>
static inline void drawPaged(SegmentT& segment,const FontView& f,const char* text,
                             uint32_t elapsedMs,uint8_t canvasWidth,uint8_t canvasHeight,
                             uint32_t color,uint16_t pageHoldMs=2200) {
  if(!text||!*text)return;
  char pageText[64]{};const uint8_t count=packPage(f,text,0,pageText);
  const uint8_t page=(uint8_t)((elapsedMs/pageHoldMs)%count);
  packPage(f,text,page,pageText);
  const uint16_t width=textWidth(f,pageText);
  int16_t x=(int16_t)(canvasWidth-width)/2;
  const int16_t y=(int16_t)(canvasHeight-f.height)/2;
  if(width>canvasWidth) {
    const uint16_t travel=(uint16_t)(width-canvasWidth);
    const uint16_t phase=(uint16_t)(elapsedMs%pageHoldMs);
    const uint16_t scrollDuration=pageHoldMs>300? pageHoldMs-300:pageHoldMs;
    const uint16_t active=phase>300?phase-300:0;
    x=(int16_t)(-((uint32_t)travel*(active>scrollDuration?scrollDuration:active)/scrollDuration));
  }
  draw(segment,f,pageText,x,y,color);
}
} // namespace HbnfNativeText
