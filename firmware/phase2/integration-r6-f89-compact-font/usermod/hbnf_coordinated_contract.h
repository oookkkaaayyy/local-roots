#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

namespace hbnf_v1 {

enum PaletteMode : uint8_t { PALETTE_LEGACY=0, PALETTE_WLED=1, PALETTE_SOLID=2 };
struct PaletteSelection {
  PaletteMode mode=PALETTE_LEGACY;
  uint8_t index=0;
  uint8_t r=255,g=255,b=255;
};

enum OverlayKind : uint8_t { OVERLAY_NONE=0, OVERLAY_TEXT=1, OVERLAY_SCOREBOARD=2 };
struct OverlayState {
  OverlayKind kind=OVERLAY_NONE;
  char id[40]{};
  char text[64]{};
  char label[16]{};
  char entries[12][64]{};
  uint8_t entryCount=0;
  uint8_t fontIndex=4;
  bool fontFitResolved=false;
  uint8_t r=255,g=255,b=255;
  uint32_t startedAt=0,ttlMs=0;
};

inline bool overlayVisible(const OverlayState& s,uint32_t now) {
  return s.kind!=OVERLAY_NONE && s.ttlMs>=250u && s.ttlMs<=30000u &&
         (uint32_t)(now-s.startedAt)<s.ttlMs;
}

inline bool validBoundedText(const char* s,size_t maxLen,bool allowEmpty=false) {
  if(!s) return false;
  const size_t n=strnlen(s,maxLen+1u);
  if(n>maxLen||(!allowEmpty&&!n)) return false;
  for(size_t i=0;i<n;i++) if((uint8_t)s[i]<32u) return false;
  return true;
}

inline void setTextOverlay(OverlayState& s,const char* id,const char* text,uint32_t ttl,
                           uint8_t r,uint8_t g,uint8_t b,uint32_t now,uint8_t fontIndex=4) {
  const bool same=s.kind==OVERLAY_TEXT && strcmp(s.id,id)==0;
  const uint32_t started=same?s.startedAt:now;
  s=OverlayState{}; s.kind=OVERLAY_TEXT; s.startedAt=started; s.ttlMs=ttl;
  strncpy(s.id,id,sizeof(s.id)-1u); strncpy(s.text,text,sizeof(s.text)-1u);
  s.r=r;s.g=g;s.b=b;s.fontIndex=fontIndex;
}

inline void setScoreboardOverlay(OverlayState& s,const char* id,const char* label,
                                 const char* const* entries,uint8_t count,uint32_t ttl,uint32_t now) {
  const bool same=s.kind==OVERLAY_SCOREBOARD && strcmp(s.id,id)==0;
  const uint32_t started=same?s.startedAt:now;
  s=OverlayState{};s.kind=OVERLAY_SCOREBOARD;s.startedAt=started;s.ttlMs=ttl;
  strncpy(s.id,id,sizeof(s.id)-1u);strncpy(s.label,label,sizeof(s.label)-1u);
  s.entryCount=count>12u?12u:count;
  for(uint8_t i=0;i<s.entryCount;i++)strncpy(s.entries[i],entries[i],sizeof(s.entries[i])-1u);
}

inline void clearOverlay(OverlayState& s) { s=OverlayState{}; }

} // namespace hbnf_v1
