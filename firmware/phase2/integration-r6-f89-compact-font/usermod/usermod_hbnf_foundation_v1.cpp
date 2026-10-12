#include "wled.h"
#include "hbnf_foundation_core.h"
#include "hbnf_vibe_runtime.h"
#include "hbnf_generative_v4.h"
#include "hbnf_vibe16.h"
#include "hbnf_audio_expression.h"
#include "hbnf_coordinated_contract.h"
#include "hbnf_animartrix_audio_bridge.h"
#include "hbnf_local_ui.h"
#include "hbnf_home_screen_icon.h"
#include "hbnf_brightness_output.h"
#include "hbnf_native_text.h"
#include "fontmanager.h"
#include <ANIMartRIX.h>
#include <string.h>
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
#include "hbnf_outlier_trace.h"
#include <esp_timer.h>
#include <freertos/task.h>
#endif
#if defined(HBNF_PACKET20_DIAGNOSTICS)
#include <esp_system.h>
#include <esp_heap_caps.h>
#include <rom/rtc.h>
#include <new>
#include <type_traits>
#endif

using namespace hbnf_v1;

namespace {

static const char HBNF_FX_DATA[] PROGMEM = "HBNF Foundation@;;;2";
static const char HBNF_CANDIDATE[] PROGMEM = "hbnf-cart2-phase2-r6-incremental-controls-20261011";
static const char HBNF_BUILD_JSON[] PROGMEM = "{\"schema\":\"hbnf-build-v1\",\"candidate\":\"hbnf-cart2-phase2-r6-incremental-controls-20261011\",\"ip\":\"192.168.77.10\",\"mac\":\"70:4b:ca:5b:34:5c\",\"release_id\":\"hbnf-cart2-phase2-r6-incremental-controls-20261011\",\"basedOnReleaseId\":\"hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1\",\"basedOnFirmwareSha256\":\"338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c\",\"wled\":\"16.0.1\",\"features\":[\"phase2-brightness-output-v1\",\"wled-native-fontmanager-text-v1\",\"foundation-vibe-audio-r5-unfrozen\",\"native-text-moments-r5-unfrozen\"]}";
static PaletteSelection hbnfPalette{};
static OverlayState hbnfCommandOverlay{};
static portMUX_TYPE hbnfOverlayMux=portMUX_INITIALIZER_UNLOCKED;
static Rgb8 canonicalMatrixPixels[32*16]{};
static Rgb8 transitionFromPixels[32*16]{};
static uint32_t canonicalMatrixFrame=0;
static bool canonicalMatrixValid=false;
static uint32_t packed(const Rgb8& c);
static uint32_t hbnfCycles() { return ESP.getCycleCount(); }
static uint32_t hbnfCycleUs(uint32_t cycles) { const uint32_t mhz=ESP.getCpuFreqMHz(); return mhz?cycles/mhz:0; }
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
static constexpr size_t HBNF_R6_OUTLIER_CAPACITY=16;
static hbnf_r6_outlier_trace::Store<HBNF_R6_OUTLIER_CAPACITY> hbnfFrameTrace{};
static hbnf_r6_outlier_trace::Record hbnfTraceWorking{};
static constexpr size_t HBNF_R6_REFERENCE_CAPACITY=4;
static hbnf_r6_outlier_trace::ReferenceStore<HBNF_R6_REFERENCE_CAPACITY> hbnfTraceReferences{};
static uint32_t hbnfTraceFramesSeen=0;
static constexpr uint16_t HBNF_R6_REFERENCE_INTERVAL=256;
static const CanonicalFrame* hbnfTraceFrame=nullptr;
static bool hbnfTraceFrameActive=false;
static portMUX_TYPE hbnfFrameTraceMux=portMUX_INITIALIZER_UNLOCKED;
static bool hbnfTraceEnabled() {
  portENTER_CRITICAL(&hbnfFrameTraceMux);const bool armed=hbnfFrameTrace.armed();portEXIT_CRITICAL(&hbnfFrameTraceMux);return armed;
}
static uint32_t hbnfR6TraceThresholdCycles=0;
static uint16_t hbnfR6TraceCpuMHz=0;
static bool hbnfR6TraceStartConsumed=false;
static void hbnfTraceVariant(hbnf_r6_outlier_trace::Record::Variant& out,const VisualVariant& v) {
  out.signature=v.signature;out.salt=v.salt;out.dwellSeconds=v.dwellSeconds;
  out.kernel=v.kernel;out.family=v.family;out.palette=v.palette;out.speed=v.speed;
  out.profile=v.profile;out.style=v.style;out.amount=v.amount;out.hueOffset=v.hueOffset;
  out.transform=v.transform;out.warp=v.warp;
}
static void hbnfTraceAudioFrame(uint8_t out[17],const AudioFrame& a) {
  out[0]=a.bass;out[1]=a.mid;out[2]=a.treble;out[3]=a.volume;out[4]=a.peak;
  out[5]=a.bassBody;out[6]=a.midBody;out[7]=a.trebleBody;
  out[8]=a.bassPulse;out[9]=a.midPulse;out[10]=a.treblePulse;out[11]=a.energy;
  out[12]=a.lowEnergy;out[13]=a.midEnergy;out[14]=a.highEnergy;out[15]=a.transient;out[16]=a.slowEnergy;
}
static void hbnfTraceAudioFeatures(uint8_t out[13],const AudioFeatures& a) {
  out[0]=a.energyShort;out[1]=a.energyMedium;out[2]=a.energySlow;out[3]=a.lowPressure;
  out[4]=a.lowTransient;out[5]=a.midBody;out[6]=a.midChange;out[7]=a.highDetail;
  out[8]=a.highTransient;out[9]=a.spectralBrightness;out[10]=a.spectralChange;
  out[11]=a.activity;out[12]=a.silenceConfidence;
}
static void hbnfTraceAxes(uint8_t out[9],const VibeAxes& a) {
  out[0]=a.structure;out[1]=a.flow;out[2]=a.depth;out[3]=a.symmetry;out[4]=a.detail;
  out[5]=a.paletteMotion;out[6]=a.density;out[7]=a.negativeSpace;out[8]=a.transitionEnergy;
}
#endif
static volatile uint32_t hbnfLastDdpSendMs=0;
struct HbnfPerfFrame {
  bool active=false; uint32_t start=0; uint32_t scheduler=0; uint32_t audio=0; uint32_t audioInKernel=0;
  uint32_t color=0; uint32_t colorInKernel=0; uint32_t kernelGross=0; uint32_t overlay=0;
  uint32_t companionPrep=0; uint32_t ddpStart=0; uint32_t ddpSend=0; bool inKernel=false;
  uint8_t kernel=255; uint32_t variant=0; uint32_t whole=0; uint32_t unaccounted=0;
};
#if defined(HBNF_PACKET20_DIAGNOSTICS)
// Fixed 250-us bins collect real per-frame samples with bounded memory and no
// per-frame allocation, sorting, or logging. Maxima remain exact.
static constexpr uint16_t HBNF_TAIL_BINS=512,HBNF_TAIL_BIN_US=250;
static uint16_t hbnfTailHist[8][HBNF_TAIL_BINS]{};
static uint64_t hbnfTailSum[8]{};
static uint32_t hbnfTailMax[8]{};
static uint16_t hbnfTailCount=0;
static uint8_t hbnfTailKernel=255;
static bool hbnfTailEnabled=false;
static portMUX_TYPE hbnfTailMux=portMUX_INITIALIZER_UNLOCKED;
static bool hbnfTailSetEnabled(bool enabled) {
  portENTER_CRITICAL(&hbnfTailMux);
  if(enabled==hbnfTailEnabled) { portEXIT_CRITICAL(&hbnfTailMux); return true; }
  hbnfTailEnabled=enabled;hbnfTailCount=0;hbnfTailKernel=255;
  memset(hbnfTailHist,0,sizeof(hbnfTailHist));memset(hbnfTailSum,0,sizeof(hbnfTailSum));memset(hbnfTailMax,0,sizeof(hbnfTailMax));
  portEXIT_CRITICAL(&hbnfTailMux);return true;
}
#endif
static HbnfPerfFrame hbnfPerfWorking{};
static HbnfPerfFrame hbnfPerfLatest{};
static portMUX_TYPE hbnfPerfMux=portMUX_INITIALIZER_UNLOCKED;
extern "C" void hbnfPerfDdpStart();
extern "C" void hbnfPerfDdpEnd();
extern "C" void hbnfPerfFrameEnd();

// AI: below section was generated by an AI
struct HbnfLiveSnapshot {
  bool active=false;
  uint8_t count=0;
  uint16_t acePot=0;
  char label[3]{};
  char entries[20][13]{};
  uint32_t lastSeenMs=0;
  uint32_t overlayStartMs=0;
  uint32_t overlayDurationMs=0;
};
static HbnfLiveSnapshot hbnfLive{};
static portMUX_TYPE hbnfLiveMux=portMUX_INITIALIZER_UNLOCKED;

static uint8_t hbnfGlyphRow(char c,uint8_t row) {
  static const uint8_t blank[5]={0,0,0,0,0};
  static const uint8_t glyphA[5]={2,5,7,5,5},glyphB[5]={6,5,6,5,6},glyphC[5]={3,4,4,4,3};
  static const uint8_t glyphD[5]={6,5,5,5,6},glyphE[5]={7,4,6,4,7},glyphF[5]={7,4,6,4,4};
  static const uint8_t glyphG[5]={3,4,5,5,3},glyphH[5]={5,5,7,5,5},glyphI[5]={7,2,2,2,7};
  static const uint8_t glyphJ[5]={1,1,1,5,2},glyphK[5]={5,5,6,5,5},glyphL[5]={4,4,4,4,7};
  static const uint8_t glyphM[5]={5,7,7,5,5},glyphN[5]={5,7,7,7,5},glyphO[5]={2,5,5,5,2};
  static const uint8_t glyphP[5]={6,5,6,4,4},glyphQ[5]={2,5,5,3,1},glyphR[5]={6,5,6,5,5};
  static const uint8_t glyphS[5]={3,4,2,1,6},glyphT[5]={7,2,2,2,2},glyphU[5]={5,5,5,5,7};
  static const uint8_t glyphV[5]={5,5,5,5,2},glyphW[5]={5,5,7,7,5},glyphX[5]={5,5,2,5,5};
  static const uint8_t glyphY[5]={5,5,2,2,2},glyphZ[5]={7,1,2,4,7};
  static const uint8_t glyph0[5]={7,5,5,5,7},glyph1[5]={2,6,2,2,7},glyph2[5]={6,1,2,4,7};
  static const uint8_t glyph3[5]={6,1,2,1,6},glyph4[5]={5,5,7,1,1},glyph5[5]={7,4,6,1,6};
  static const uint8_t glyph6[5]={3,4,7,5,7},glyph7[5]={7,1,2,2,2},glyph8[5]={7,5,7,5,7};
  static const uint8_t glyph9[5]={7,5,7,1,6},glyphDollar[5]={3,6,2,3,6},glyphDash[5]={0,0,7,0,0};
  static const uint8_t glyphSlash[5]={1,1,2,4,4},glyphDot[5]={0,0,0,0,2},glyphQuestion[5]={6,1,2,0,2};
  const uint8_t* p=blank;
  switch(c) {
    case 'A':p=glyphA;break;case 'B':p=glyphB;break;case 'C':p=glyphC;break;case 'D':p=glyphD;break;
    case 'E':p=glyphE;break;case 'F':p=glyphF;break;case 'G':p=glyphG;break;case 'H':p=glyphH;break;
    case 'I':p=glyphI;break;case 'J':p=glyphJ;break;case 'K':p=glyphK;break;case 'L':p=glyphL;break;
    case 'M':p=glyphM;break;case 'N':p=glyphN;break;case 'O':p=glyphO;break;case 'P':p=glyphP;break;
    case 'Q':p=glyphQ;break;case 'R':p=glyphR;break;case 'S':p=glyphS;break;case 'T':p=glyphT;break;
    case 'U':p=glyphU;break;case 'V':p=glyphV;break;case 'W':p=glyphW;break;case 'X':p=glyphX;break;
    case 'Y':p=glyphY;break;case 'Z':p=glyphZ;break;case '0':p=glyph0;break;case '1':p=glyph1;break;
    case '2':p=glyph2;break;case '3':p=glyph3;break;case '4':p=glyph4;break;case '5':p=glyph5;break;
    case '6':p=glyph6;break;case '7':p=glyph7;break;case '8':p=glyph8;break;case '9':p=glyph9;break;
    case '$':p=glyphDollar;break;case '-':p=glyphDash;break;case '/':p=glyphSlash;break;case '.':p=glyphDot;break;case '?':p=glyphQuestion;break;
  }
  return row<5?p[row]:0;
}

static void hbnfDrawText(const char* text,int y,uint32_t color) {
  if(!text)return;
  const int len=(int)strlen(text);
  const int width=len?len*4-1:0;
  int x=(32-width)/2;
  for(int n=0;n<len&&x<32;n++,x+=4) {
    char c=text[n]; if(c>='a'&&c<='z')c=(char)(c-'a'+'A');
    for(uint8_t gy=0;gy<5;gy++) {
      const uint8_t bits=hbnfGlyphRow(c,gy);
      for(uint8_t gx=0;gx<3;gx++) if(bits&(1u<<(2u-gx))&&x+(int)gx>=0&&x+(int)gx<32&&y+(int)gy>=0&&y+(int)gy<16)
        SEGMENT.setPixelColorXY(x+(int)gx,y+(int)gy,color);
    }
  }
}

static bool hbnfParseHexColor(const char* s,uint8_t& r,uint8_t& g,uint8_t& b) {
  if(!s||strlen(s)!=7||s[0]!='#')return false;
  uint8_t values[3]{};
  for(uint8_t c=0;c<3;c++) {
    const char hi=s[1+c*2],lo=s[2+c*2];
    auto digit=[](char x)->int { if(x>='0'&&x<='9')return x-'0';if(x>='a'&&x<='f')return x-'a'+10;if(x>='A'&&x<='F')return x-'A'+10;return -1; };
    const int h=digit(hi),l=digit(lo);if(h<0||l<0)return false;values[c]=(uint8_t)((h<<4)|l);
  }
  r=values[0];g=values[1];b=values[2];return true;
}

static bool hbnfAcceptOverlay(JsonVariantConst input,bool explicitNull,uint32_t now) {
  if(explicitNull){portENTER_CRITICAL(&hbnfOverlayMux);clearOverlay(hbnfCommandOverlay);portEXIT_CRITICAL(&hbnfOverlayMux);return true;}
  JsonObjectConst obj=input.as<JsonObjectConst>();
  if(obj.isNull()) { portENTER_CRITICAL(&hbnfOverlayMux);clearOverlay(hbnfCommandOverlay);portEXIT_CRITICAL(&hbnfOverlayMux);return false; }
  const char* id=obj["id"]|"";const char* kind=obj["kind"]|"";const uint32_t ttl=obj["ttlMs"]|0;
  if(!validBoundedText(id,39)||ttl<250u||ttl>30000u)goto invalid;
  if(strcmp(kind,"text")==0) {
    const char* text=obj["text"]|"";uint8_t r=255,g=255,b=255;
    const int requestedFontIndex=obj["fontIndex"]|4;
    const uint8_t fontIndex=(requestedFontIndex==0||requestedFontIndex==2||requestedFontIndex==3||requestedFontIndex==4)?(uint8_t)requestedFontIndex:4;
    if(!validBoundedText(text,63)||!hbnfParseHexColor(obj["color"]|"#FFFFFF",r,g,b))goto invalid;
    portENTER_CRITICAL(&hbnfOverlayMux);
    setTextOverlay(hbnfCommandOverlay,id,text,ttl,r,g,b,now,fontIndex);
    portEXIT_CRITICAL(&hbnfOverlayMux);return true;
  }
  if(strcmp(kind,"scoreboard")==0) {
    const char* label=obj["label"]|"";JsonArrayConst inputEntries=obj["entries"].as<JsonArrayConst>();
    if(!validBoundedText(label,15)||inputEntries.isNull()||inputEntries.size()==0||inputEntries.size()>12)goto invalid;
    if(strcmp(label,"F9")&&strcmp(label,"B9")&&strcmp(label,"GLOW")&&strcmp(label,"SCORES"))goto invalid;
    char entries[12][64]{};uint8_t count=0;
    for(JsonVariantConst entry:inputEntries) {
      if(!entry.is<const char*>())goto invalid;
      const char* line=entry.as<const char*>();if(!validBoundedText(line,63))goto invalid;
      strlcpy(entries[count++],line,sizeof(entries[0]));
    }
    const char* ptrs[12]{};for(uint8_t i=0;i<count;i++)ptrs[i]=entries[i];
    portENTER_CRITICAL(&hbnfOverlayMux);
    setScoreboardOverlay(hbnfCommandOverlay,id,label,ptrs,count,ttl,now);
    portEXIT_CRITICAL(&hbnfOverlayMux);return true;
  }
invalid:
  portENTER_CRITICAL(&hbnfOverlayMux);clearOverlay(hbnfCommandOverlay);portEXIT_CRITICAL(&hbnfOverlayMux);return false;
}

static Rgb8 hbnfPaletteColor(uint8_t r,uint8_t g,uint8_t b,uint8_t index) {
  if(hbnfPalette.mode==PALETTE_SOLID) {
    const uint8_t level=(uint8_t)(((uint16_t)r*54u+(uint16_t)g*183u+(uint16_t)b*19u+128u)>>8);
    return scaleRgb(Rgb8(hbnfPalette.r,hbnfPalette.g,hbnfPalette.b),level);
  }
  if(hbnfPalette.mode==PALETTE_WLED) {
    const uint8_t level=(uint8_t)(((uint16_t)r*54u+(uint16_t)g*183u+(uint16_t)b*19u+128u)>>8);
    const CRGB color=ColorFromPalette(Segment::getCurrentPalette(),index,level,LINEARBLEND);
    return Rgb8(color.r,color.g,color.b);
  }
  return hueRotate(Rgb8(r,g,b),index);
}

static bool hbnfRenderCommandOverlay(uint8_t matrixBrightness,Vibe activeVibe) {
  // The fixed OverlayState contains 768 bytes of scoreboard entry storage.
  // Avoid copying it under the spinlock on every render frame when no command
  // overlay is active (the normal palette/showcase path).
  OverlayState overlay;
  portENTER_CRITICAL(&hbnfOverlayMux);
  if(hbnfCommandOverlay.kind==OVERLAY_NONE) {
    portEXIT_CRITICAL(&hbnfOverlayMux);
    return false;
  }
  overlay=hbnfCommandOverlay;
  portEXIT_CRITICAL(&hbnfOverlayMux);
  const uint32_t now=millis();if(!overlayVisible(overlay,now))return false;
  const Rgb8 overlayColor(overlay.r,overlay.g,overlay.b);
  const uint8_t scale=hbnf_brightness::outputScale(matrixBrightness);
  const uint32_t fg=packed(hbnf_brightness::scaleOutputPixel(overlayColor,overlayColor,scale));
  if(overlay.kind==OVERLAY_TEXT) {
    FontManager font(&SEGMENT);
    bool fontLoaded=false;
    if(!overlay.fontFitResolved) {
      const uint8_t requestedFontIndex=overlay.fontIndex;
      const uint8_t selected=HbnfNativeText::resolveFontIndex(font,overlay.fontIndex,overlay.text,32);
      if(selected!=255){overlay.fontIndex=selected;fontLoaded=true;}
      overlay.fontFitResolved=true;
      portENTER_CRITICAL(&hbnfOverlayMux);
      if(hbnfCommandOverlay.kind==OVERLAY_TEXT &&
         hbnfCommandOverlay.startedAt==overlay.startedAt &&
         !hbnfCommandOverlay.fontFitResolved &&
         hbnfCommandOverlay.fontIndex==requestedFontIndex &&
         strcmp(hbnfCommandOverlay.id,overlay.id)==0 &&
         strcmp(hbnfCommandOverlay.text,overlay.text)==0) {
        hbnfCommandOverlay.fontIndex=overlay.fontIndex;
        hbnfCommandOverlay.fontFitResolved=true;
      }
      portEXIT_CRITICAL(&hbnfOverlayMux);
    } else {
      fontLoaded=font.loadFont(overlay.fontIndex,overlay.text,false);
      if(!fontLoaded&&overlay.fontIndex!=4)fontLoaded=font.loadFont(4,overlay.text,false);
    }
    const uint32_t elapsed=(uint32_t)(now-overlay.startedAt);
    const uint32_t remaining=overlay.ttlMs>elapsed?overlay.ttlMs-elapsed:0;
    uint8_t alpha=255;
    if(elapsed<420u)alpha=(uint8_t)(elapsed*255u/420u);
    if(remaining<520u){const uint8_t out=(uint8_t)(remaining*255u/520u);if(out<alpha)alpha=out;}
    int8_t yOffset=elapsed<280u?(int8_t)(2u-(elapsed*2u/280u)):(remaining<220u?-1:0);
    Rgb8 accent=overlayColor;
    switch(activeVibe){
      case VIBE_GROOVE: accent=blend(overlayColor,Rgb8(255,98,52),92);break;
      case VIBE_HEAVY: accent=blend(overlayColor,Rgb8(255,122,38),112);break;
      case VIBE_PSYCHEDELIC: accent=blend(overlayColor,Rgb8(190,64,255),112);break;
      case VIBE_COSMIC: accent=blend(overlayColor,Rgb8(74,136,255),96);break;
      default: accent=blend(overlayColor,Rgb8(115,220,236),72);break;
    }
    const uint32_t gradient=packed(hbnf_brightness::scaleOutputPixel(accent,accent,scale));
    if(fontLoaded)HbnfNativeText::drawPaged(font,overlay.text,elapsed,32,16,fg,2200,gradient,alpha,yOffset);
  } else {
    if(overlay.kind==OVERLAY_SCOREBOARD&&overlay.entryCount) {
      hbnfDrawText(overlay.label,0,fg);
      const uint8_t pages=(uint8_t)((overlay.entryCount+1u)/2u);
      const uint8_t page=(uint8_t)(((uint32_t)(now-overlay.startedAt)/1800u)%pages);
      hbnfDrawText(overlay.entries[page*2u],5,fg);
      if(page*2u+1u<overlay.entryCount)hbnfDrawText(overlay.entries[page*2u+1u],10,fg);
    }
  }
  return true;
}

static void hbnfRenderLiveOverlay(uint8_t matrixBrightness) {
  HbnfLiveSnapshot live;
  portENTER_CRITICAL(&hbnfLiveMux); live=hbnfLive; portEXIT_CRITICAL(&hbnfLiveMux);
  const uint32_t now=millis();
  if(!live.active||!live.count||(uint32_t)(now-live.lastSeenMs)>=120000u||!live.overlayDurationMs||(uint32_t)(now-live.overlayStartMs)>=live.overlayDurationMs)return;
  const uint32_t elapsed=(uint32_t)(now-live.overlayStartMs);
  const uint32_t fadeIn=350u,fadeOut=450u;
  uint8_t fade=255;
  if(elapsed<fadeIn)fade=(uint8_t)(elapsed*255u/fadeIn);
  else if(live.overlayDurationMs-elapsed<fadeOut)fade=(uint8_t)((live.overlayDurationMs-elapsed)*255u/fadeOut);
  const uint8_t shade=(uint8_t)(210u*fade/255u);
  for(uint8_t y=0;y<16;y++)for(uint8_t x=0;x<32;x++)SEGMENT.blendPixelColorXY(x,y,RGBW32(0,0,0,0),shade);
  const uint8_t outputScale=hbnf_brightness::outputScale(matrixBrightness);

  const uint8_t pages=(uint8_t)((live.count+1u)/2u);
  const uint8_t page=(uint8_t)(((elapsed/1900u)%pages));
  char header[12];
  snprintf(header,sizeof(header),"%s $%u",live.label,(unsigned)live.acePot);
  const Rgb8 headerColor(176,224,132), entryColor(255,255,255);
  hbnfDrawText(header,0,packed(scaleRgb(hbnf_brightness::scaleOutputPixel(headerColor,headerColor,outputScale),fade)));
  hbnfDrawText(live.entries[page*2u],5,packed(scaleRgb(hbnf_brightness::scaleOutputPixel(entryColor,entryColor,outputScale),fade)));
  if((uint8_t)(page*2u+1u)<live.count)hbnfDrawText(live.entries[page*2u+1u],10,packed(scaleRgb(hbnf_brightness::scaleOutputPixel(entryColor,entryColor,outputScale),fade)));
}

static bool hbnfAcceptLiveSnapshot(JsonObjectConst root) {
  const char* schema=root["schema"]|"";
  if(strcmp(schema,"hbnf-live-v1")!=0)return false;
  const bool active=root["active"]|false;
  const char* label=root["label"]|"";
  const uint32_t acePotValue=root["acePot"]|0;
  if(acePotValue>9999)return false;
  const uint16_t acePot=(uint16_t)acePotValue;
  JsonArrayConst input=root["entries"].as<JsonArrayConst>();
  HbnfLiveSnapshot next{};
  next.active=active;next.acePot=acePot;
  if(active) {
    if(strcmp(label,"F9")!=0&&strcmp(label,"B9")!=0)return false;
    if(input.isNull()||input.size()==0||input.size()>20)return false;
    strlcpy(next.label,label,sizeof(next.label));
    for(JsonVariantConst entry:input) {
      if(!entry.is<const char*>())return false;
      const char* text=entry.as<const char*>();size_t n=strlen(text);
      if(!n||n>12)return false;
      for(size_t i=0;i<n;i++) {
        const char ch=text[i];
        if(!((ch>='A'&&ch<='Z')||(ch>='a'&&ch<='z')||(ch>='0'&&ch<='9')||ch==' '||ch=='/'||ch=='-'||ch=='.'||ch=='?'||ch=='$'))return false;
      }
      strlcpy(next.entries[next.count++],text,sizeof(next.entries[0]));
    }
    const uint32_t pages=(next.count+1u)/2u;
    next.overlayDurationMs=constrain(pages*1900u+900u,2800u,20000u);
  } else {
    if(!input.isNull()&&input.size()>0)return false;
  }
  next.lastSeenMs=millis();
  HbnfLiveSnapshot old;
  portENTER_CRITICAL(&hbnfLiveMux);old=hbnfLive;portEXIT_CRITICAL(&hbnfLiveMux);
  bool changed=old.active!=next.active||old.acePot!=next.acePot||strcmp(old.label,next.label)!=0||old.count!=next.count;
  if(!changed)for(uint8_t i=0;i<next.count;i++)if(strcmp(old.entries[i],next.entries[i])!=0){changed=true;break;}
  next.overlayStartMs=changed?millis():old.overlayStartMs;
  if(!changed)next.overlayDurationMs=old.overlayDurationMs;
  portENTER_CRITICAL(&hbnfLiveMux);hbnfLive=next;portEXIT_CRITICAL(&hbnfLiveMux);
  return true;
}
// AI: end

class FoundationRuntime {
 public:
  FoundationRuntime() { reset(); }

  void reset() {
    controls_ = Controls{};
    frameNo_ = 0; phaseQ16_ = 0; lastNow_ = 0;
    cachedNow_ = 0xffffffffu; lastAudio_ = AudioFrame{};
    variant_ = VisualVariant{}; previousVariant_ = VisualVariant{};
    nextVariantAt_ = 0; transitionStartAt_ = 0; transitionActive_ = false; configDirtyAt_ = 0;
    hasSelectedVariant_=false;
    configDirty_ = false; vibe_.reset(); expression_.reset();
    vibeFeatures_.reset(); autoVibe_.reset(); resolvedVibe_=VIBE_CHILL; audioFeatures_=AudioFeatures{};
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
    memset(lastFft_,0,sizeof(lastFft_));memset(lastVibeAudioInputFloatBits_,0,sizeof(lastVibeAudioInputFloatBits_));
    lastVibeAudioInputSilent_=true;lastVolumeFloatBits_=0;lastAudioSourcePresent_=false;
#endif
  }

  void initialize(uint32_t seed,uint32_t now) { generator_.reset(seed); chooseVariant(now); previousVariant_=variant_; transitionActive_=false; }

  void tick(uint32_t now) {
#if defined(HBNF_PACKET20_DIAGNOSTICS)
    if (!diagnosticMode_ && (int32_t)(now-nextVariantAt_) >= 0) chooseVariant(now);
#else
    if ((int32_t)(now-nextVariantAt_) >= 0) chooseVariant(now);
#endif
    if (configDirty_ && (uint32_t)(now-configDirtyAt_) >= 850u) {
      configNeedsWrite = true; configDirty_ = false;
    }
  }

  void markConfigDirty(uint32_t now) { configDirty_=true; configDirtyAt_=now; }
  void invalidateFrame() { cachedNow_=0xffffffffu; }
  void restoreSettings(uint8_t matrix,uint8_t aux) { controls_.matrixBrightness=matrix; controls_.auxBrightness=aux; }
  void selectVibe(Vibe vibe,uint32_t now) {
    if((uint8_t)vibe>(uint8_t)VIBE_AUTO||controls_.vibe==vibe)return;
    controls_.vibe=vibe;
    if(vibe!=VIBE_AUTO)resolvedVibe_=vibe;
    else {autoVibe_.reset(now);resolvedVibe_=VIBE_CHILL;}
    chooseVariant(now);invalidateFrame();
  }
  Vibe resolvedVibe() const { return resolvedVibe_; }

  const CanonicalFrame& frame() {
    const uint32_t now = strip.now;
    if (cachedNow_ == now) return cached_;

    uint32_t dt = lastNow_ ? (now - lastNow_) : 16u;
    if (dt > 100u) dt = 100u;
    lastNow_ = now;

    // Base field travel is ~8.2 seconds per low-word traversal at Motion=50.
    // fieldCoords() uses the high-word epoch as slow spatial/palette drift,
    // preventing an exact short loop while Motion remains the sole time-scale.
    phaseQ16_ = advancePhaseQ16(phaseQ16_,dt,controls_.motion);

    if (audioNow_ != now) lastAudio_ = readAudio(now);
    const Vibe nextVibe=controls_.vibe==VIBE_AUTO?autoVibe_.update(audioFeatures_,now):controls_.vibe;
    if(nextVibe!=resolvedVibe_){resolvedVibe_=nextVibe;chooseVariant(now);}
    // Keep every appearance-defining variant field fixed for the full dwell.
    // The effect clock supplies continuous motion; audio lanes supply continuous response.
    cached_ = makeFrame(++frameNo_, phaseQ16_, controls_, lastAudio_, variant_, previousVariant_, transitionMix(millis()));
    cached_.vibe=resolvedVibe_;
    cached_.vibeAxes=vibeResponse(resolvedVibe_,audioFeatures_);
    cachedNow_ = now;
    return cached_;
  }

  Controls& controls() { return controls_; }
  const Controls& controls() const { return controls_; }
  const AudioFrame& lastAudio() const { return lastAudio_; }
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
  const AudioFeatures& lastAudioFeatures() const { return audioFeatures_; }
  const uint8_t* lastFft() const { return lastFft_; }
  uint32_t lastVolumeFloatBits() const { return lastVolumeFloatBits_; }
  const uint32_t* lastVibeAudioInputFloatBits() const { return lastVibeAudioInputFloatBits_; }
  bool lastVibeAudioInputSilent() const { return lastVibeAudioInputSilent_; }
  bool lastAudioSourcePresent() const { return lastAudioSourcePresent_; }
#endif
  const VisualVariant& variant() const { return variant_; }
  void chooseSceneVariant(uint32_t now) { chooseVariant(now); }
#if defined(HBNF_PACKET20_DIAGNOSTICS)
  void diagnosticBegin() { diagnosticMode_=true; }
  void diagnosticEndAfterRestore(uint32_t now) {
    diagnosticMode_=false;
    nextVariantAt_=now+(uint32_t)variant_.dwellSeconds*1000u;
  }
  bool diagnosticSelectKernel(uint8_t kernel) {
    if(!diagnosticMode_ || kernel>=hbnf::GenerativeV4::EFFECT_COUNT) return false;
    variant_.kernel=kernel;
    variant_.signature=0x504b2000u | kernel;
    transitionActive_=false;
    invalidateFrame();
    return true;
  }
  bool diagnosticActive() const { return diagnosticMode_; }
  bool diagnosticEquivalent(const FoundationRuntime& other) const {
    return memcmp(&controls_,&other.controls_,sizeof(controls_))==0 &&
      frameNo_==other.frameNo_ && phaseQ16_==other.phaseQ16_ && lastNow_==other.lastNow_ &&
      cachedNow_==other.cachedNow_ && memcmp(&cached_,&other.cached_,sizeof(cached_))==0 &&
      memcmp(&lastAudio_,&other.lastAudio_,sizeof(lastAudio_))==0 &&
      memcmp(&variant_,&other.variant_,sizeof(variant_))==0 &&
      memcmp(&previousVariant_,&other.previousVariant_,sizeof(previousVariant_))==0 &&
      memcmp(&generator_,&other.generator_,sizeof(generator_))==0 &&
      memcmp(&vibe_,&other.vibe_,sizeof(vibe_))==0 &&
      memcmp(&expression_,&other.expression_,sizeof(expression_))==0 &&
      memcmp(&vibeFeatures_,&other.vibeFeatures_,sizeof(vibeFeatures_))==0 &&
      memcmp(&autoVibe_,&other.autoVibe_,sizeof(autoVibe_))==0 &&
      memcmp(&audioFeatures_,&other.audioFeatures_,sizeof(audioFeatures_))==0 &&
      resolvedVibe_==other.resolvedVibe_ &&
      transitionStartAt_==other.transitionStartAt_ && configDirtyAt_==other.configDirtyAt_ &&
      transitionDurationMs_==other.transitionDurationMs_ &&
      hasSelectedVariant_==other.hasSelectedVariant_ && transitionActive_==other.transitionActive_ &&
      configDirty_==other.configDirty_ && audioNow_==other.audioNow_;
  }
#endif

 private:
  Controls controls_{};
  uint32_t frameNo_=0;
  uint32_t phaseQ16_=0;
  uint32_t lastNow_=0;
  uint32_t cachedNow_=0xffffffffu;
  CanonicalFrame cached_{};
  AudioFrame lastAudio_{};
  VisualVariant variant_{};
  VisualVariant previousVariant_{};
  hbnf::GenerativeV4 generator_{};
  hbnf::Vibe16 vibe_{};
  hbnf::AudioExpression expression_{};
  VibeAudioFeatures vibeFeatures_{};
  AutoVibeSelector autoVibe_{};
  AudioFeatures audioFeatures_{};
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
  uint8_t lastFft_[16]{};
  uint32_t lastVibeAudioInputFloatBits_[13]{};
  bool lastVibeAudioInputSilent_=true;
  uint32_t lastVolumeFloatBits_=0;
  bool lastAudioSourcePresent_=false;
#endif
  Vibe resolvedVibe_=VIBE_CHILL;
  uint32_t nextVariantAt_=0,transitionStartAt_=0,configDirtyAt_=0;
  uint16_t transitionDurationMs_=3000;
  bool hasSelectedVariant_=false;
  bool transitionActive_=false,configDirty_=false;
  uint32_t audioNow_=0;
#if defined(HBNF_PACKET20_DIAGNOSTICS)
  bool diagnosticMode_=false;
#endif

  void chooseVariant(uint32_t now) {
    if(hasSelectedVariant_ && canonicalMatrixValid) {
      memcpy(transitionFromPixels,canonicalMatrixPixels,sizeof(transitionFromPixels));
      transitionStartAt_=now;
      transitionActive_=true;
    } else {
      transitionActive_=false;
    }
    previousVariant_=variant_;
    const auto v=generator_.next((hbnf::GenerativeDomain)(uint8_t)controls_.scene);
    variant_.kernel=(uint8_t)(v.effectId-hbnf::GenerativeV4::EFFECT_FIRST);
    variant_.family=v.familyId; variant_.palette=v.palette;
    variant_.speed=v.speed; variant_.profile=v.profile; variant_.style=v.style; variant_.amount=v.amount;
    variant_.transform=(uint8_t)(v.variantCode&7u);
    variant_.warp=(uint8_t)(v.variantCode>>5);
    variant_.salt=v.offset; variant_.dwellSeconds=v.dwellSeconds; variant_.signature=v.signature;
    const VibeAxes axes=vibeResponse(resolvedVibe_,audioFeatures_);
    variant_.profile=vibeProfileCode(resolvedVibe_);
    variant_.style=vibeStyleCode(resolvedVibe_);
    const uint16_t speedScale=(uint16_t)(128u+(uint16_t)axes.flow*127u/255u);
    uint16_t mappedSpeed=(uint16_t)(((uint16_t)v.speed*speedScale+127u)/255u);
    variant_.speed=(uint8_t)(mappedSpeed<54u?54u:(mappedSpeed>220u?220u:mappedSpeed));
    const uint16_t mappedAmount=(uint16_t)v.amount-((uint16_t)(255u-axes.detail)*18u/255u);
    variant_.amount=(uint8_t)(mappedAmount<160u?160u:(mappedAmount>255u?255u:mappedAmount));
    variant_.hueOffset=(int8_t)((int16_t)axes.paletteMotion-128);
    if(axes.symmetry>190u)variant_.transform^=0x03u;
    static const uint16_t transitionMs[5]={4200,2300,1550,1900,4800};
    transitionDurationMs_=transitionMs[(uint8_t)resolvedVibe_<5u?(uint8_t)resolvedVibe_:0u];
    nextVariantAt_=now+(uint32_t)v.dwellSeconds*1000u;
    hasSelectedVariant_=true;
  }

  uint8_t transitionMix(uint32_t now) const {
    if(!transitionActive_) return 255;
    const uint32_t elapsed=now-transitionStartAt_;
    if(elapsed>=transitionDurationMs_) return 255;
    return (uint8_t)((elapsed*255u)/transitionDurationMs_);
  }

  static uint8_t unit8(float v) {
    if (!isfinite(v) || v<=0.0f) return 0;
    if (v>=1.0f) return 255;
    return (uint8_t)(v*255.0f+0.5f);
  }

  AudioFrame readAudio(uint32_t now) {
    AudioFrame a{};
    um_data_t* um=nullptr;
    const float dt=audioNow_?(uint32_t)(now-audioNow_)/1000.0f:0.021f;
    audioNow_=now;
    if (!UsermodManager::getUMData(&um, USERMOD_ID_AUDIOREACTIVE) ||
        !um || um->u_size < 4 || !um->u_data || !um->u_data[2]) {
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
      memset(lastFft_,0,sizeof(lastFft_));memset(lastVibeAudioInputFloatBits_,0,sizeof(lastVibeAudioInputFloatBits_));
      lastVibeAudioInputSilent_=true;lastVolumeFloatBits_=0;lastAudioSourcePresent_=false;
#endif
      hbnf::VibeMetrics silent{};silent.silent=true;
      silent.bassAtt=silent.midAtt=silent.trebleAtt=0.0f;
      const hbnf::AudioExpressionSignals e=expression_.update(silent,dt);
      a.lowEnergy=unit8(e.lowEnergy);a.midEnergy=unit8(e.midEnergy);a.highEnergy=unit8(e.highEnergy);
      a.transient=unit8(e.transient);a.slowEnergy=unit8(e.slowEnergy);
      VibeAudioInput input{};input.silent=true;
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
      lastVibeAudioInputSilent_=true;
#endif
      audioFeatures_=vibeFeatures_.update(input,(uint32_t)(dt*1000.0f));
      return a;
    }

    const uint8_t* fft = reinterpret_cast<const uint8_t*>(um->u_data[2]);
    // Exact WLED 16.0.1 AudioReactive exposes fftResult at u_data[2],
    // volumeSmth at [0], and samplePeak at [3]. Use the same representative
    // bands as WLED's own three-channel Spectrum palette: 0 / 4 / 10.
    float volume=0.0f;
    if (um->u_data[0]) volume=*reinterpret_cast<const float*>(um->u_data[0]);
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
    memcpy(lastFft_,fft,sizeof(lastFft_));memcpy(&lastVolumeFloatBits_,&volume,sizeof(volume));lastAudioSourcePresent_=true;
#endif
    a.volume=(uint8_t)(volume<=0?0:(volume>=255?255:(uint8_t)(volume+0.5f)));
    const hbnf::VibeMetrics m=vibe_.update(fft,volume,dt);
    const hbnf::AudioExpressionSignals e=expression_.update(m,dt);
    const bool peak=um->u_data[3]&&*reinterpret_cast<const uint8_t*>(um->u_data[3])!=0;
    a=audioFromVibe(m.bassPulse,m.midPulse,m.treblePulse,m.bassAtt,m.midAtt,m.trebleAtt,m.energy,a.volume,peak);
    a.lowEnergy=unit8(e.lowEnergy);a.midEnergy=unit8(e.midEnergy);a.highEnergy=unit8(e.highEnergy);
    a.transient=unit8(e.transient);a.slowEnergy=unit8(e.slowEnergy);
    VibeAudioInput input{};
    for(uint8_t i=0;i<16;i++)input.fft[i]=fft[i];
    input.volume=volume/255.0f;input.bassAtt=m.bassAtt;input.midAtt=m.midAtt;input.trebleAtt=m.trebleAtt;
    input.bassPulse=m.bassPulse;input.midPulse=m.midPulse;input.treblePulse=m.treblePulse;
    input.energy=m.energy;input.lowEnergy=e.lowEnergy;input.midEnergy=e.midEnergy;input.highEnergy=e.highEnergy;
    input.transient=e.transient;input.slowEnergy=e.slowEnergy;input.silent=m.silent;
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
    const float traceAudioValues[13]={input.volume,input.bassAtt,input.midAtt,input.trebleAtt,
      input.bassPulse,input.midPulse,input.treblePulse,input.energy,input.lowEnergy,
      input.midEnergy,input.highEnergy,input.transient,input.slowEnergy};
    for(uint8_t i=0;i<13;i++)memcpy(&lastVibeAudioInputFloatBits_[i],&traceAudioValues[i],sizeof(float));
    lastVibeAudioInputSilent_=input.silent;
#endif
    audioFeatures_=vibeFeatures_.update(input,(uint32_t)(dt*1000.0f));
    return a;
  }
};

static FoundationRuntime runtime;

#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
static void hbnfTraceStartFrame() {
  portENTER_CRITICAL(&hbnfFrameTraceMux);
  if(!hbnfFrameTrace.armed()){portEXIT_CRITICAL(&hbnfFrameTraceMux);return;}
  hbnfTraceWorking.frameSequence=hbnfFrameTrace.nextFrameSequence();++hbnfTraceFramesSeen;
  portEXIT_CRITICAL(&hbnfFrameTraceMux);
  hbnfTraceWorking.monotonicUs=(uint64_t)esp_timer_get_time();
  hbnfTraceWorking.taskHandle=(uintptr_t)xTaskGetCurrentTaskHandle();
  hbnfTraceWorking.coreStart=(int8_t)xPortGetCoreID();hbnfTraceWorking.cpuMhzStart=(uint16_t)ESP.getCpuFreqMHz();
  hbnfTraceFrame=nullptr;
  hbnfTraceFrameActive=true;
}

static void hbnfTraceContext(const CanonicalFrame& f,const FoundationRuntime& r) {
  hbnfTraceWorking.frame=f.frame;
  hbnfTraceWorking.scene=(uint8_t)f.controls.scene;hbnfTraceWorking.vibe=(uint8_t)f.vibe;
  hbnfTraceWorking.motion=f.controls.motion;hbnfTraceWorking.matrixBrightness=f.controls.matrixBrightness;
  hbnfTraceWorking.auxBrightness=f.controls.auxBrightness;hbnfTraceWorking.audioResponse=f.controls.audioResponse;
  hbnfTraceWorking.matrixWidth=(uint8_t)SEGMENT.virtualWidth();hbnfTraceWorking.matrixHeight=(uint8_t)SEGMENT.virtualHeight();
  hbnfTraceWorking.audioSourcePresent=(uint8_t)r.lastAudioSourcePresent();
  hbnfTraceWorking.paletteMode=(uint8_t)hbnfPalette.mode;hbnfTraceWorking.paletteIndex=hbnfPalette.index;
  hbnfTraceWorking.variantMix=f.variantMix;hbnfTraceVariant(hbnfTraceWorking.current,f.variant);
  hbnfTraceVariant(hbnfTraceWorking.previous,f.previousVariant);
  hbnfTraceAudioFrame(hbnfTraceWorking.audioFrame,f.audio);
  hbnfTraceAudioFeatures(hbnfTraceWorking.audioFeatures,r.lastAudioFeatures());
  memcpy(hbnfTraceWorking.fft,r.lastFft(),sizeof(hbnfTraceWorking.fft));
  memcpy(hbnfTraceWorking.vibeAudioInputFloatBits,r.lastVibeAudioInputFloatBits(),sizeof(hbnfTraceWorking.vibeAudioInputFloatBits));
  hbnfTraceWorking.vibeAudioInputSilent=(uint8_t)r.lastVibeAudioInputSilent();
  hbnfTraceWorking.volumeFloatBits=r.lastVolumeFloatBits();
  hbnfTraceAxes(hbnfTraceWorking.vibeAxes,f.vibeAxes);
}

static void hbnfTraceEndFrame() {
  if(!hbnfTraceFrameActive)return;
  hbnfTraceFrameActive=false;
  if(!hbnfTraceEnabled())return;
  const uint64_t endUs=(uint64_t)esp_timer_get_time();
  hbnfTraceWorking.wallElapsedUs=(uint32_t)(endUs-hbnfTraceWorking.monotonicUs);
  hbnfTraceWorking.cpuMhzEnd=(uint16_t)ESP.getCpuFreqMHz();
  hbnfTraceWorking.coreEnd=(int8_t)xPortGetCoreID();
  hbnfTraceWorking.frameStartCycles=hbnfPerfWorking.start;hbnfTraceWorking.frameEndCycles=hbnfPerfWorking.start+hbnfPerfWorking.whole;
  hbnfTraceWorking.wholeFrameCycles=hbnfPerfWorking.whole;hbnfTraceWorking.kernelGrossCycles=hbnfPerfWorking.kernelGross;
  hbnfTraceWorking.audioCycles=hbnfPerfWorking.audio;hbnfTraceWorking.audioInKernelCycles=hbnfPerfWorking.audioInKernel;
  hbnfTraceWorking.colorCycles=hbnfPerfWorking.color;hbnfTraceWorking.colorInKernelCycles=hbnfPerfWorking.colorInKernel;
  hbnfTraceWorking.schedulerCycles=hbnfPerfWorking.scheduler;hbnfTraceWorking.overlayCycles=hbnfPerfWorking.overlay;
  hbnfTraceWorking.companionPrepCycles=hbnfPerfWorking.companionPrep;hbnfTraceWorking.ddpSendCycles=hbnfPerfWorking.ddpSend;
  hbnfTraceWorking.unaccountedCycles=hbnfPerfWorking.unaccounted;hbnfTraceWorking.variantSignature=hbnfPerfWorking.variant;
  const bool outlier=hbnf_r6_outlier_trace::exceeds(hbnfTraceWorking.wholeFrameCycles,hbnfR6TraceThresholdCycles);
  const bool reference=!outlier&&((hbnfTraceWorking.frameSequence%HBNF_R6_REFERENCE_INTERVAL)==0u);
  if((outlier||reference)&&hbnfTraceFrame) {
    const uint32_t traceStart=hbnfCycles();
    hbnfTraceWorking.freeHeap=ESP.getFreeHeap();
    hbnfTraceContext(*hbnfTraceFrame,runtime);
    portENTER_CRITICAL(&hbnfFrameTraceMux);
    if(!hbnfFrameTrace.armed()) {
      portEXIT_CRITICAL(&hbnfFrameTraceMux);return;
    } else if(outlier) {
      hbnfFrameTrace.append(hbnfTraceWorking);
      hbnfFrameTrace.setLastCaptureBodyCycles(hbnfCycles()-traceStart);
    } else {
      hbnfTraceReferences.append(hbnfTraceWorking);
      hbnfTraceReferences.setLastCaptureBodyCycles(hbnfCycles()-traceStart);
    }
    portEXIT_CRITICAL(&hbnfFrameTraceMux);
  }
}
#endif

static bool hbnfApplyPalette(JsonVariantConst input) {
  JsonObjectConst obj=input.as<JsonObjectConst>();if(obj.isNull())return false;
  const char* mode=obj["mode"]|"";PaletteSelection next=hbnfPalette;
  if(!strcmp(mode,"legacy")) {
    const char* id=obj["id"]|"";if(strcmp(id,"hbnf-balanced")&&strcmp(id,"copper")&&strcmp(id,"ocean"))return false;
    next.mode=PALETTE_LEGACY;
  } else if(!strcmp(mode,"wled")) {
    if(!obj["index"].is<int>())return false;const int index=obj["index"].as<int>();if(index<0||index>255)return false;
    next.mode=PALETTE_WLED;next.index=(uint8_t)index;
  } else if(!strcmp(mode,"solid")) {
    JsonArrayConst rgb=obj["rgb"].as<JsonArrayConst>();if(rgb.isNull()||rgb.size()!=3)return false;
    for(uint8_t i=0;i<3;i++)if(!rgb[i].is<int>()||rgb[i].as<int>()<0||rgb[i].as<int>()>255)return false;
    next.mode=PALETTE_SOLID;next.r=(uint8_t)rgb[0].as<int>();next.g=(uint8_t)rgb[1].as<int>();next.b=(uint8_t)rgb[2].as<int>();
  } else return false;
  hbnfPalette=next;
  if(strip.getSegmentsNum()) {
    if(next.mode==PALETTE_WLED)strip.getSegment(0).setPalette(next.index);
  }
  runtime.invalidateFrame();stateChanged=true;return true;
}
static uint8_t foundationEffectId=255;
static volatile uint32_t companionRenderCount=0;
static volatile uint8_t companionLastNonzero=0;

class FoundationAnimartrix : public ANIMartRIX {
 public:
#if defined(HBNF_PACKET20_DIAGNOSTICS)
  struct DiagnosticState {
    int numX=0,numY=0;
    float speedFactor=1.0f;
    double animationClockMs=0.0,animationClockSpeed=1.0;
    uint32_t animationClockLastMs=0;
    bool animationClockStarted=false;
    float radialFilterRadius=23.0f;
    bool serpentine=false;
    unsigned long a=0,b=0,c=0;
    float show[10]{};
    hbnf::AnimartrixAudioBridge audio{};
    const CanonicalFrame* frame=nullptr;
    uint8_t lastKernel=255;
    uint16_t lastWidth=0,lastHeight=0;
    bool deferOutput=false;
  };

  DiagnosticState diagnosticCapture() const {
    DiagnosticState s{};
    s.numX=num_x;s.numY=num_y;s.speedFactor=speed_factor;
    s.animationClockMs=animation_clock_ms_;s.animationClockSpeed=animation_clock_speed_;
    s.animationClockLastMs=animation_clock_last_ms_;s.animationClockStarted=animation_clock_started_;
    s.radialFilterRadius=radial_filter_radius;s.serpentine=serpentine;
    s.a=a;s.b=b;s.c=c;
    s.show[0]=show0;s.show[1]=show1;s.show[2]=show2;s.show[3]=show3;s.show[4]=show4;
    s.show[5]=show5;s.show[6]=show6;s.show[7]=show7;s.show[8]=show8;s.show[9]=show9;
    s.audio=audio_;s.frame=frame_;s.lastKernel=lastKernel_;s.lastWidth=lastWidth_;
    s.lastHeight=lastHeight_;s.deferOutput=deferOutput_;
    return s;
  }

  void diagnosticRestore(const DiagnosticState& s) {
    num_x=s.numX;num_y=s.numY;speed_factor=s.speedFactor;
    animation_clock_ms_=s.animationClockMs;animation_clock_speed_=s.animationClockSpeed;
    animation_clock_last_ms_=s.animationClockLastMs;animation_clock_started_=s.animationClockStarted;
    radial_filter_radius=s.radialFilterRadius;serpentine=s.serpentine;
    a=s.a;b=s.b;c=s.c;
    show0=s.show[0];show1=s.show[1];show2=s.show[2];show3=s.show[3];show4=s.show[4];
    show5=s.show[5];show6=s.show[6];show7=s.show[7];show8=s.show[8];show9=s.show[9];
    audio_=s.audio;frame_=s.frame;lastKernel_=s.lastKernel;lastWidth_=s.lastWidth;
    lastHeight_=s.lastHeight;deferOutput_=s.deferOutput;
  }
  static bool diagnosticSame(const DiagnosticState& a,const DiagnosticState& b) {
    return a.numX==b.numX&&a.numY==b.numY&&a.speedFactor==b.speedFactor&&
      a.animationClockMs==b.animationClockMs&&a.animationClockSpeed==b.animationClockSpeed&&
      a.animationClockLastMs==b.animationClockLastMs&&a.animationClockStarted==b.animationClockStarted&&
      a.radialFilterRadius==b.radialFilterRadius&&a.serpentine==b.serpentine&&
      a.a==b.a&&a.b==b.b&&a.c==b.c&&memcmp(a.show,b.show,sizeof(a.show))==0&&
      memcmp(&a.audio,&b.audio,sizeof(a.audio))==0&&a.frame==b.frame&&
      a.lastKernel==b.lastKernel&&a.lastWidth==b.lastWidth&&a.lastHeight==b.lastHeight&&
      a.deferOutput==b.deferOutput;
  }
#endif

  void beginFrame(const CanonicalFrame& f,uint32_t now) {
    frame_=&f;
    outputScale_=hbnf_brightness::outputScale(f.controls.matrixBrightness);
    const uint16_t responseQ8=audioGainQ8(f.controls.audioResponse);
    const uint32_t audioStart=hbnfCycles();
    audio_.beginFrameFromAudio(now,f.variant.profile,f.variant.style,f.variant.amount,responseQ8,32,16,
      (uint8_t)(220u+f.variant.kernel),f.audio.bassPulse,f.audio.midPulse,
      f.audio.treblePulse,f.audio.bassBody,f.audio.midBody,f.audio.trebleBody,
      f.audio.energy,f.audio.lowEnergy,f.audio.midEnergy,f.audio.highEnergy,
      f.audio.transient,f.audio.slowEnergy);
    hbnfPerfWorking.audio+=hbnfCycles()-audioStart;
    SEGMENT.setPalette(f.variant.palette);
  }

  void render(uint8_t kernel,uint8_t speed) {
    if (lastKernel_!=kernel || lastWidth_!=SEGMENT.virtualWidth() || lastHeight_!=SEGMENT.virtualHeight()) {
      init(SEGMENT.virtualWidth(),SEGMENT.virtualHeight(),false);
      lastKernel_=kernel; lastWidth_=SEGMENT.virtualWidth(); lastHeight_=SEGMENT.virtualHeight();
    }
    deferOutput_=frame_->variantMix<255u;
    if(deferOutput_) memset(canonicalMatrixPixels,0,sizeof(canonicalMatrixPixels));
    const float motion=(float)frame_->controls.motion/100.0f;
    const float motionScale=0.10f+1.90f*motion*motion;
    setSpeedFactor(((float)speed/128.0f)*motionScale);
    const uint32_t kernelStart=hbnfCycles(); hbnfPerfWorking.inKernel=true;
    switch(kernel) {
      case 0: Complex_Kaleido_3(); break;
      case 1: Big_Caleido(); break;
      case 2: Parametric_Water(); break;
      case 3: RGB_Blobs5(); break;
      case 4: Polar_Waves(); break;
      case 5: Zoom2(); break;
      case 6: Complex_Kaleido_4(); break;
      case 7: Complex_Kaleido_6(); break;
      case 8: Water(); break;
      case 9: RGB_Blobs4(); break;
      case 10: Complex_Kaleido_5(); break;
      case 11: Spiralus2(); break;
      case 12: Hot_Blob(); break;
      case 13: Caleido3(); break;
      case 14: Waves(); break;
      case 15: Chasing_Spirals(); break;
      case 16: Rotating_Blob(); break;
      case 17: Center_Field(); break;
      case 18: Distance_Experiment(); break;
      case 19: Lava1(); break;
      case 20: Caleido2(); break;
      case 21: Yves(); break;
      case 22: Scaledemo1(); break;
      case 23: Zoom(); break;
      case 24: Complex_Kaleido(); break;
      case 25: RGB_Blobs3(); break;
      case 26: SM5(); break;
      default: Module_Experiment10(); break;
    }
    hbnfPerfWorking.inKernel=false; hbnfPerfWorking.kernelGross+=hbnfCycles()-kernelStart;
    if(deferOutput_) {
      const uint32_t colorStart=hbnfCycles();
      const uint8_t mix=frame_->variantMix;
      for(uint16_t y=0;y<16;y++) for(uint16_t x=0;x<32;x++) {
        const uint16_t i=y*32u+x;
        canonicalMatrixPixels[i]=blend(transitionFromPixels[i],canonicalMatrixPixels[i],mix);
        const Rgb8 matrix=hbnfScaleMatrixOutput(canonicalMatrixPixels[i],outputScale_);
        SEGMENT.setPixelColorXY(x,y,RGBW32(matrix.r,matrix.g,matrix.b,0));
      }
      hbnfPerfWorking.color+=hbnfCycles()-colorStart;
      if(mix==255u) deferOutput_=false;
    }
    canonicalMatrixFrame=frame_->frame;
    canonicalMatrixValid=true;
  }

  void setPixelColor(int x,int y,rgb pixel) { writePixel(x,y,pixel); }
  void setPixelColor(int index,rgb pixel) {
    const int width=SEGMENT.virtualWidth();
    writePixel(width?index%width:0,width?index/width:0,pixel);
  }

 private:
  uint8_t outputScale_=255;
  static Rgb8 hbnfScaleMatrixOutput(const Rgb8& canonical,uint8_t scale) {
    const Rgb8 gammaCorrected=SEGMENT.check2?Rgb8(gamma8(canonical.r),gamma8(canonical.g),gamma8(canonical.b)):canonical;
    return hbnf_brightness::scaleOutputPixel(gammaCorrected,canonical,scale);
  }

  hbnf::AnimartrixAudioBridge audio_{};
  const CanonicalFrame* frame_=nullptr;
  uint8_t lastKernel_=255;
  uint16_t lastWidth_=0,lastHeight_=0;
  bool deferOutput_=false;

  void writePixel(int x,int y,rgb pixel) {
    uint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
    uint16_t tx=(uint16_t)x,ty=(uint16_t)y;
    if(frame_->variant.transform&1u) tx=(uint16_t)(31u-tx);
    if(frame_->variant.transform&2u) ty=(uint16_t)(15u-ty);
    if(frame_->variant.transform&4u){tx=(uint16_t)((tx+frame_->variant.salt%32u)%32u);ty=(uint16_t)((ty+(frame_->variant.salt>>5)%16u)%16u);}
    const uint32_t audioStart=hbnfCycles(); audio_.modulate(tx,ty,r,g,b);
    const uint32_t audioCycles=hbnfCycles()-audioStart; hbnfPerfWorking.audio+=audioCycles;
    if(hbnfPerfWorking.inKernel)hbnfPerfWorking.audioInKernel+=audioCycles;
    const uint32_t colorStart=hbnfCycles();
    const uint8_t hue=(uint8_t)(frame_->variant.palette*37u+frame_->variant.salt%31u+(int16_t)frame_->variant.hueOffset);
    const Rgb8 colored=hbnfPalette.mode==PALETTE_LEGACY?hueRotate(Rgb8(r,g,b),hue):hbnfPaletteColor(r,g,b,hue);
    const uint32_t colorCycles=hbnfCycles()-colorStart; hbnfPerfWorking.color+=colorCycles;
    if(hbnfPerfWorking.inKernel)hbnfPerfWorking.colorInKernel+=colorCycles;
    const Rgb8 rendered=composeVibeColor(colored,*frame_,tx,ty);
    if(x>=0&&x<32&&y>=0&&y<16&&tx<32&&ty<16) canonicalMatrixPixels[ty*32u+tx]=rendered;
    if(deferOutput_) return;
    const Rgb8 matrix=hbnfScaleMatrixOutput(rendered,outputScale_);
    SEGMENT.setPixelColorXY(tx,ty,RGBW32(matrix.r,matrix.g,matrix.b,0));
  }

  static Rgb8 blend(const Rgb8& from,const Rgb8& to,uint8_t mix) {
    const uint16_t inv=255u-mix;
    return Rgb8((uint8_t)(((uint16_t)from.r*inv+(uint16_t)to.r*mix+127u)/255u),
                (uint8_t)(((uint16_t)from.g*inv+(uint16_t)to.g*mix+127u)/255u),
                (uint8_t)(((uint16_t)from.b*inv+(uint16_t)to.b*mix+127u)/255u));
  }
};
static FoundationAnimartrix foundationAnimartrix;

#if defined(HBNF_PACKET20_DIAGNOSTICS)
// Single volatile in-RAM snapshot. The packet runner aborts on restart; this
// state is never represented as durable across a reboot.
struct Packet20Snapshot {
  FoundationRuntime runtime;
  FoundationAnimartrix::DiagnosticState renderer;
  PaletteSelection palette;
  OverlayState commandOverlay;
  HbnfLiveSnapshot live;
  HbnfPerfFrame perfWorking,perfLatest;
  render_parameters animationState;
  oscillators timingState;
  modulators movementState;
  rgb pixelState;
  Rgb8 matrixPixels[32*16];
  Rgb8 transitionPixels[32*16];
  uint32_t matrixOutput[32*16];
  uint32_t auxOutput[23];
  uint32_t matrixFrame=0,companionFrames=0,lastDdpSendMs=0;
  uint8_t companionNonzero=0,effectId=255,segmentPalette=0;
  bool matrixValid=false;
};
static_assert(std::is_trivially_copyable<FoundationRuntime>::value,"Packet20 runtime snapshot must be byte-copyable");
static_assert(std::is_trivially_copyable<FoundationAnimartrix::DiagnosticState>::value,"Packet20 renderer snapshot must be byte-copyable");
enum class Packet20SnapshotState : uint8_t { IDLE, REQUESTED, CAPTURING, READY, RESTORED, FAILED };
static Packet20Snapshot packet20Saved{};
static Packet20Snapshot packet20Verify{};
static bool packet20SavedValid=false,packet20RestoreVerified=false;
static uint32_t packet20SnapshotId=0,packet20SnapshotHash=0,packet20SnapshotGeneration=0;
static volatile Packet20SnapshotState packet20SnapshotState=Packet20SnapshotState::IDLE;
static volatile bool packet20RestoreRequested=false;
static portMUX_TYPE packet20SnapshotMux=portMUX_INITIALIZER_UNLOCKED;
static uint8_t packet20Selected=255;
static bool packet20LastCommandAccepted=false;
static char packet20LastCommand[12]="";
static void packet20Capture(Packet20Snapshot& s);

static const char* packet20SnapshotStateName(Packet20SnapshotState state) {
  switch(state) {
    case Packet20SnapshotState::IDLE:return "IDLE";
    case Packet20SnapshotState::REQUESTED:return "REQUESTED";
    case Packet20SnapshotState::CAPTURING:return "CAPTURING";
    case Packet20SnapshotState::READY:return "READY";
    case Packet20SnapshotState::RESTORED:return "RESTORED";
    default:return "FAILED";
  }
}

// Called only by the Matrix renderer after a complete frame. The async JSON
// callback only queues a generation; all large copies remain renderer-owned.

static uint32_t packet20Hash(const Packet20Snapshot& s) {
  uint32_t h=2166136261u;
  auto add=[&](const void* data,size_t size) {
    const uint8_t* bytes=(const uint8_t*)data;
    for(size_t i=0;i<size;i++){h^=bytes[i];h*=16777619u;}
  };
#define HBNF_P20_HASH_FIELD(field) add(&s.field,sizeof(s.field))
  HBNF_P20_HASH_FIELD(runtime);HBNF_P20_HASH_FIELD(renderer);HBNF_P20_HASH_FIELD(palette);
  HBNF_P20_HASH_FIELD(commandOverlay);HBNF_P20_HASH_FIELD(live);HBNF_P20_HASH_FIELD(perfWorking);
  HBNF_P20_HASH_FIELD(perfLatest);HBNF_P20_HASH_FIELD(animationState);HBNF_P20_HASH_FIELD(timingState);
  HBNF_P20_HASH_FIELD(movementState);HBNF_P20_HASH_FIELD(pixelState);add(s.matrixPixels,sizeof(s.matrixPixels));
  add(s.transitionPixels,sizeof(s.transitionPixels));add(s.matrixOutput,sizeof(s.matrixOutput));
  add(s.auxOutput,sizeof(s.auxOutput));
  HBNF_P20_HASH_FIELD(matrixFrame);HBNF_P20_HASH_FIELD(companionFrames);HBNF_P20_HASH_FIELD(lastDdpSendMs);HBNF_P20_HASH_FIELD(companionNonzero);
  HBNF_P20_HASH_FIELD(effectId);HBNF_P20_HASH_FIELD(segmentPalette);HBNF_P20_HASH_FIELD(matrixValid);
#undef HBNF_P20_HASH_FIELD
  return h?h:1u;
}

static void packet20Capture(Packet20Snapshot& s) {
  memcpy(&s.runtime,&runtime,sizeof(runtime));
  s.renderer=foundationAnimartrix.diagnosticCapture();
  memcpy(&s.palette,&hbnfPalette,sizeof(hbnfPalette));
  portENTER_CRITICAL(&hbnfOverlayMux);memcpy(&s.commandOverlay,&hbnfCommandOverlay,sizeof(hbnfCommandOverlay));portEXIT_CRITICAL(&hbnfOverlayMux);
  portENTER_CRITICAL(&hbnfLiveMux);memcpy(&s.live,&hbnfLive,sizeof(hbnfLive));portEXIT_CRITICAL(&hbnfLiveMux);
  portENTER_CRITICAL(&hbnfPerfMux);memcpy(&s.perfWorking,&hbnfPerfWorking,sizeof(hbnfPerfWorking));memcpy(&s.perfLatest,&hbnfPerfLatest,sizeof(hbnfPerfLatest));portEXIT_CRITICAL(&hbnfPerfMux);
  memcpy(&s.animationState,&animation,sizeof(animation));memcpy(&s.timingState,&timings,sizeof(timings));
  memcpy(&s.movementState,&move,sizeof(move));memcpy(&s.pixelState,&pixel,sizeof(pixel));
  memcpy(s.matrixPixels,canonicalMatrixPixels,sizeof(canonicalMatrixPixels));
  memcpy(s.transitionPixels,transitionFromPixels,sizeof(transitionFromPixels));
  for(uint8_t y=0;y<16;y++)for(uint8_t x=0;x<32;x++)s.matrixOutput[y*32u+x]=SEGMENT.getPixelColorXY(x,y);
  for(uint8_t i=0;i<23;i++)s.auxOutput[i]=strip.getPixelColor(512u+i);
  s.matrixFrame=canonicalMatrixFrame;s.matrixValid=canonicalMatrixValid;
  s.companionFrames=companionRenderCount;s.lastDdpSendMs=hbnfLastDdpSendMs;s.companionNonzero=companionLastNonzero;
  s.effectId=foundationEffectId;s.segmentPalette=SEGMENT.palette;
}

static bool packet20Same(const Packet20Snapshot& a,const Packet20Snapshot& b) {
#define HBNF_P20_SAME(field) (memcmp(&a.field,&b.field,sizeof(a.field))==0)
  return a.runtime.diagnosticEquivalent(b.runtime)&&FoundationAnimartrix::diagnosticSame(a.renderer,b.renderer)&&HBNF_P20_SAME(palette)&&
    HBNF_P20_SAME(commandOverlay)&&HBNF_P20_SAME(live)&&HBNF_P20_SAME(perfWorking)&&
    HBNF_P20_SAME(perfLatest)&&HBNF_P20_SAME(animationState)&&HBNF_P20_SAME(timingState)&&
    HBNF_P20_SAME(movementState)&&HBNF_P20_SAME(pixelState)&&
    memcmp(a.matrixPixels,b.matrixPixels,sizeof(a.matrixPixels))==0&&
    memcmp(a.transitionPixels,b.transitionPixels,sizeof(a.transitionPixels))==0&&
    memcmp(a.matrixOutput,b.matrixOutput,sizeof(a.matrixOutput))==0&&
    memcmp(a.auxOutput,b.auxOutput,sizeof(a.auxOutput))==0&&
    HBNF_P20_SAME(matrixFrame)&&HBNF_P20_SAME(companionFrames)&&HBNF_P20_SAME(lastDdpSendMs)&&HBNF_P20_SAME(companionNonzero)&&
    HBNF_P20_SAME(effectId)&&HBNF_P20_SAME(segmentPalette)&&HBNF_P20_SAME(matrixValid);
#undef HBNF_P20_SAME
}

static void packet20Restore() {
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
  portENTER_CRITICAL(&hbnfFrameTraceMux);hbnfFrameTrace.stop();portEXIT_CRITICAL(&hbnfFrameTraceMux);
#endif
  memcpy(&runtime,&packet20Saved,sizeof(runtime));
  runtime.diagnosticEndAfterRestore(millis());
  foundationAnimartrix.diagnosticRestore(packet20Saved.renderer);
  memcpy(&hbnfPalette,&packet20Saved.palette,sizeof(hbnfPalette));
  portENTER_CRITICAL(&hbnfOverlayMux);memcpy(&hbnfCommandOverlay,&packet20Saved.commandOverlay,sizeof(hbnfCommandOverlay));portEXIT_CRITICAL(&hbnfOverlayMux);
  portENTER_CRITICAL(&hbnfLiveMux);memcpy(&hbnfLive,&packet20Saved.live,sizeof(hbnfLive));portEXIT_CRITICAL(&hbnfLiveMux);
  portENTER_CRITICAL(&hbnfPerfMux);memcpy(&hbnfPerfWorking,&packet20Saved.perfWorking,sizeof(hbnfPerfWorking));memcpy(&hbnfPerfLatest,&packet20Saved.perfLatest,sizeof(hbnfPerfLatest));portEXIT_CRITICAL(&hbnfPerfMux);
  memcpy(&animation,&packet20Saved.animationState,sizeof(animation));memcpy(&timings,&packet20Saved.timingState,sizeof(timings));
  memcpy(&move,&packet20Saved.movementState,sizeof(move));memcpy(&pixel,&packet20Saved.pixelState,sizeof(pixel));
  memcpy(canonicalMatrixPixels,packet20Saved.matrixPixels,sizeof(canonicalMatrixPixels));
  memcpy(transitionFromPixels,packet20Saved.transitionPixels,sizeof(transitionFromPixels));
  canonicalMatrixFrame=packet20Saved.matrixFrame;canonicalMatrixValid=packet20Saved.matrixValid;
  companionRenderCount=packet20Saved.companionFrames;hbnfLastDdpSendMs=packet20Saved.lastDdpSendMs;companionLastNonzero=packet20Saved.companionNonzero;
  foundationEffectId=packet20Saved.effectId;SEGMENT.setPalette(packet20Saved.segmentPalette);
  for(uint8_t y=0;y<16;y++)for(uint8_t x=0;x<32;x++)SEGMENT.setPixelColorXY(x,y,packet20Saved.matrixOutput[y*32u+x]);
  for(uint8_t i=0;i<23;i++)strip.setPixelColor(512u+i,packet20Saved.auxOutput[i]);
  packet20Selected=runtime.variant().kernel;
}

#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
static uint8_t hbnfTraceReadKind=0; // 1 outlier, 2 normal reference, 3 worst
static uint32_t hbnfTraceReadCursor=0;
static void hbnfTraceVariantJson(JsonObject out,const hbnf_r6_outlier_trace::Record::Variant& v) {
  out["signature"]=v.signature;out["kernel"]=v.kernel;out["family"]=v.family;out["palette"]=v.palette;
  out["speed"]=v.speed;out["profileCode"]=v.profile;out["styleCode"]=v.style;out["amount"]=v.amount;
  out["hueOffset"]=v.hueOffset;out["transform"]=v.transform;out["warp"]=v.warp;
  out["salt"]=v.salt;out["dwellSeconds"]=v.dwellSeconds;
}
static void hbnfTraceRecordJson(JsonObject out,const hbnf_r6_outlier_trace::Record& r) {
  out["frameSequence"]=r.frameSequence;out["frame"]=r.frame;
  out["monotonicStartUsHi"]=hbnf_r6_outlier_trace::timestampHigh(r.monotonicUs);
  out["monotonicStartUsLo"]=hbnf_r6_outlier_trace::timestampLow(r.monotonicUs);
  out["wallElapsedUs"]=r.wallElapsedUs;out["traceCaptureBodyCycles"]=r.traceCaptureBodyCycles;
  out["freeHeapAtFrameEnd"]=r.freeHeap;
  JsonObject timing=out.createNestedObject("timing");
  timing["wholeCcountElapsedCycles"]=r.wholeFrameCycles;timing["framePreparationCcountElapsedCycles"]=r.schedulerCycles;
  timing["kernelGrossCcountElapsedCycles"]=r.kernelGrossCycles;timing["audioCcountElapsedCycles"]=r.audioCycles;
  timing["audioWithinKernelCcountElapsedCycles"]=r.audioInKernelCycles;
  timing["paletteCcountElapsedCycles"]=r.colorCycles;timing["paletteWithinKernelCcountElapsedCycles"]=r.colorInKernelCycles;
  timing["overlayCcountElapsedCycles"]=r.overlayCycles;
  timing["companionPrepCcountElapsedCycles"]=r.companionPrepCycles;timing["ddpSendCcountElapsedCycles"]=r.ddpSendCycles;
  timing["unaccountedCcountElapsedCycles"]=r.unaccountedCycles;
  timing["basis"]="CCOUNT elapsed core cycles; can include interruption/preemption; not task CPU time";
  JsonObject schedule=out.createNestedObject("executionContext");schedule["taskHandle"]=static_cast<uint32_t>(r.taskHandle);
  schedule["coreStart"]=r.coreStart;schedule["coreEnd"]=r.coreEnd;schedule["cpuMhzStart"]=r.cpuMhzStart;schedule["cpuMhzEnd"]=r.cpuMhzEnd;
  schedule["sameCore"]=r.coreStart==r.coreEnd;schedule["sameFrequency"]=r.cpuMhzStart==r.cpuMhzEnd;
  schedule["taskRuntimeStatsAvailable"]=false;
  JsonObject ctx=out.createNestedObject("runtime");ctx["scene"]=r.scene;ctx["vibe"]=r.vibe;ctx["motion"]=r.motion;
  ctx["matrixBrightness"]=r.matrixBrightness;ctx["auxBrightness"]=r.auxBrightness;ctx["audioResponse"]=r.audioResponse;
  ctx["matrixWidth"]=r.matrixWidth;ctx["matrixHeight"]=r.matrixHeight;ctx["paletteMode"]=r.paletteMode;
  ctx["paletteIndex"]=r.paletteIndex;ctx["variantMix"]=r.variantMix;ctx["audioSourcePresent"]=r.audioSourcePresent;
  JsonObject variant=out.createNestedObject("postVibeVariant");hbnfTraceVariantJson(variant,r.current);
  JsonObject previous=out.createNestedObject("previousVariant");hbnfTraceVariantJson(previous,r.previous);
  const char* afNames[17]={"bass","mid","treble","volume","peak","bassBody","midBody","trebleBody","bassPulse","midPulse","treblePulse","energy","lowEnergy","midEnergy","highEnergy","transient","slowEnergy"};
  JsonObject af=out.createNestedObject("audioFrame");for(uint8_t i=0;i<17;i++)af[afNames[i]]=r.audioFrame[i];
  const char* featureNames[13]={"energyShort","energyMedium","energySlow","lowPressure","lowTransient","midBody","midChange","highDetail","highTransient","spectralBrightness","spectralChange","activity","silenceConfidence"};
  JsonObject feat=out.createNestedObject("audioFeatures");for(uint8_t i=0;i<13;i++)feat[featureNames[i]]=r.audioFeatures[i];
  JsonArray fft=out.createNestedArray("fft16");for(uint8_t v:r.fft)fft.add(v);
  const char* inputNames[13]={"volume","bassAtt","midAtt","trebleAtt","bassPulse","midPulse","treblePulse","energy","lowEnergy","midEnergy","highEnergy","transient","slowEnergy"};
  JsonObject input=out.createNestedObject("vibeAudioInputFloatBits");for(uint8_t i=0;i<13;i++)input[inputNames[i]]=r.vibeAudioInputFloatBits[i];
  out["vibeAudioInputSilent"]=r.vibeAudioInputSilent;out["wledAudioVolumeFloatBits"]=r.volumeFloatBits;
  const char* axisNames[9]={"structure","flow","depth","symmetry","detail","paletteMotion","density","negativeSpace","transitionEnergy"};
  JsonObject axes=out.createNestedObject("vibeAxes");for(uint8_t i=0;i<9;i++)axes[axisNames[i]]=r.vibeAxes[i];
}
static void hbnfTraceJson(JsonObject p20) {
  JsonObject trace=p20.createNestedObject("frameContextTrace");
  bool enabled,worstValid;uint32_t count,overflow,outliers,referenceCount,referenceTotal,referenceOverflow,framesSeen;
  uint32_t thresholdCycles,readCursor;uint16_t traceCpuMHz;uint8_t readKind;
  portENTER_CRITICAL(&hbnfFrameTraceMux);
  enabled=hbnfFrameTrace.armed();count=hbnfFrameTrace.count();overflow=hbnfFrameTrace.overflowCount();
  outliers=hbnfFrameTrace.outlierCount();worstValid=hbnfFrameTrace.worstValid();
  referenceCount=(uint32_t)hbnfTraceReferences.count();referenceTotal=hbnfTraceReferences.total();referenceOverflow=hbnfTraceReferences.overflow();
  framesSeen=hbnfTraceFramesSeen;thresholdCycles=hbnfR6TraceThresholdCycles;traceCpuMHz=hbnfR6TraceCpuMHz;
  readKind=hbnfTraceReadKind;readCursor=hbnfTraceReadCursor;
  portEXIT_CRITICAL(&hbnfFrameTraceMux);
  trace["enabled"]=enabled;trace["outlierCapacity"]=HBNF_R6_OUTLIER_CAPACITY;trace["outlierRetainedCount"]=count;
  trace["outlierCount"]=outliers;trace["outlierOverflowCount"]=overflow;trace["worstValid"]=worstValid;
  trace["thresholdUs"]=42.03125;trace["thresholdCycles"]=thresholdCycles;
  trace["cpuMHzAtTraceStart"]=traceCpuMHz;trace["cpuMHzAtReadback"]=ESP.getCpuFreqMHz();
  trace["cpuTaskRuntimeStatsAvailable"]=false;
  trace["timingBasis"]="esp_timer monotonic wall elapsed plus ESP32 CCOUNT elapsed core cycles; CCOUNT is not task CPU time";
  trace["normalReferenceIntervalFrames"]=HBNF_R6_REFERENCE_INTERVAL;
  trace["normalReferenceCapacity"]=HBNF_R6_REFERENCE_CAPACITY;trace["normalReferenceRetainedCount"]=referenceCount;
  trace["normalReferenceTotalCount"]=referenceTotal;trace["normalReferenceOverwrittenCount"]=referenceOverflow;
  trace["framesSeen"]=framesSeen;
  if(enabled||!readKind)return;
  JsonObject row=trace.createNestedObject("readback");row["kind"]=readKind==1?"outlier":(readKind==2?"reference":"worst");row["cursor"]=readCursor;
  hbnf_r6_outlier_trace::Record r{};bool valid=false;
  portENTER_CRITICAL(&hbnfFrameTraceMux);
  if(readKind==1&&readCursor<count){r=hbnfFrameTrace.chronological(readCursor);valid=true;}
  else if(readKind==2&&readCursor<referenceCount){r=hbnfTraceReferences.chronological(readCursor);valid=true;}
  else if(readKind==3&&worstValid){r=hbnfFrameTrace.worst();valid=true;}
  portEXIT_CRITICAL(&hbnfFrameTraceMux);
  row["valid"]=valid;if(valid)hbnfTraceRecordJson(row,r);
}
#endif

static void packet20ServiceAtRendererSafePoint() {
  bool restore=false;
  uint32_t generation=0;
  portENTER_CRITICAL(&packet20SnapshotMux);
  if(packet20RestoreRequested) {
    packet20RestoreRequested=false;restore=true;
  } else if(packet20SnapshotState==Packet20SnapshotState::REQUESTED) {
    packet20SnapshotState=Packet20SnapshotState::CAPTURING;
    generation=packet20SnapshotGeneration;
  }
  portEXIT_CRITICAL(&packet20SnapshotMux);
  if(restore) {
    packet20Restore();
    packet20Capture(packet20Verify);
    const bool verified=packet20Same(packet20Saved,packet20Verify);
    portENTER_CRITICAL(&packet20SnapshotMux);
    packet20RestoreVerified=verified;
    if(verified) {
      packet20SavedValid=false;
      packet20SnapshotState=Packet20SnapshotState::RESTORED;
    } else packet20SnapshotState=Packet20SnapshotState::FAILED;
    portEXIT_CRITICAL(&packet20SnapshotMux);
    return;
  }
  if(!generation)return;
  if(!runtime.diagnosticActive()) {
    portENTER_CRITICAL(&packet20SnapshotMux);
    if(packet20SnapshotGeneration==generation)packet20SnapshotState=Packet20SnapshotState::FAILED;
    portEXIT_CRITICAL(&packet20SnapshotMux);
    return;
  }
  packet20Capture(packet20Saved);
  const uint32_t hash=packet20Hash(packet20Saved);
  portENTER_CRITICAL(&packet20SnapshotMux);
  if(packet20SnapshotGeneration==generation) {
    packet20SnapshotId=generation;packet20SnapshotHash=hash;packet20SavedValid=true;
    packet20RestoreVerified=false;packet20SnapshotState=Packet20SnapshotState::READY;
  }
  portEXIT_CRITICAL(&packet20SnapshotMux);
}

static bool packet20Command(JsonObjectConst command) {
  const char* op=command["op"]|"";
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
  if(!strcmp(op,"traceStart")) {
    if(!runtime.diagnosticActive()||!packet20SavedValid||hbnfTraceEnabled()||hbnfR6TraceStartConsumed||!hbnfTailEnabled)return false;
    portENTER_CRITICAL(&packet20SnapshotMux);const bool ready=packet20SnapshotState==Packet20SnapshotState::READY;portEXIT_CRITICAL(&packet20SnapshotMux);
    const uint16_t mhz=(uint16_t)ESP.getCpuFreqMHz();
    if(!ready||!mhz||mhz!=(F_CPU/1000000u))return false;
    portENTER_CRITICAL(&hbnfFrameTraceMux);
    hbnfR6TraceCpuMHz=mhz;
    hbnfR6TraceThresholdCycles=(uint32_t)mhz*42031u+(uint32_t)mhz/4u;
    hbnfTraceReferences.clear();hbnfTraceFramesSeen=0;hbnfTraceReadKind=0;hbnfTraceReadCursor=0;
    hbnfFrameTrace.start();hbnfR6TraceStartConsumed=hbnfR6TraceThresholdCycles!=0;
    if(!hbnfR6TraceStartConsumed)hbnfFrameTrace.stop();
    portEXIT_CRITICAL(&hbnfFrameTraceMux);
    if(!hbnfR6TraceStartConsumed)return false;
    return true;
  }
  if(!strcmp(op,"traceStop")) {
    if(!hbnfTraceEnabled())return false;
    portENTER_CRITICAL(&hbnfFrameTraceMux);hbnfFrameTrace.stop();portEXIT_CRITICAL(&hbnfFrameTraceMux);
    return true;
  }
  if(!strcmp(op,"traceRead")) {
    if(hbnfTraceEnabled()||!hbnfR6TraceStartConsumed||!command["cursor"].is<uint32_t>())return false;
    const char* kind=command["kind"]|"outlier";
    if(strcmp(kind,"outlier")&&strcmp(kind,"reference")&&strcmp(kind,"worst"))return false;
    const uint32_t cursor=command["cursor"].as<uint32_t>();
    if(!strcmp(kind,"worst")&&cursor!=0)return false;
    portENTER_CRITICAL(&hbnfFrameTraceMux);
    const bool valid=(!strcmp(kind,"outlier")&&cursor<hbnfFrameTrace.count())||
       (!strcmp(kind,"reference")&&cursor<hbnfTraceReferences.count())||(!strcmp(kind,"worst")&&hbnfFrameTrace.worstValid());
    if(valid){hbnfTraceReadKind=!strcmp(kind,"outlier")?1:(!strcmp(kind,"reference")?2:3);hbnfTraceReadCursor=cursor;}
    portEXIT_CRITICAL(&hbnfFrameTraceMux);
    return valid;
  }
#endif
  if(!strcmp(op,"begin")) {
    bool allowed=false;
    portENTER_CRITICAL(&packet20SnapshotMux);
    const bool restored=packet20SnapshotState==Packet20SnapshotState::RESTORED&&packet20RestoreVerified&&!packet20SavedValid;
    const bool initial=packet20SnapshotState==Packet20SnapshotState::IDLE&&!packet20SavedValid;
    allowed=(initial||restored)&&!runtime.diagnosticActive();
    if(allowed)packet20RestoreVerified=false;
    portEXIT_CRITICAL(&packet20SnapshotMux);
    if(!allowed)return false;
    runtime.diagnosticBegin();packet20RestoreVerified=false;packet20Selected=runtime.variant().kernel;
    return true;
  }
  if(!runtime.diagnosticActive())return false;
  if(!strcmp(op,"select")) {
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
    if(hbnfTraceEnabled())return false;
#endif
    if(!command["kernel"].is<uint8_t>())return false;
    const uint8_t kernel=command["kernel"].as<uint8_t>();
    if(!runtime.diagnosticSelectKernel(kernel))return false;
    packet20Selected=kernel;packet20RestoreVerified=false;return true;
  }
  if(!strcmp(op,"snapshot")) {
    bool queued=false;
    portENTER_CRITICAL(&packet20SnapshotMux);
    if(!packet20SavedValid&&packet20SnapshotState==Packet20SnapshotState::IDLE) {
      ++packet20SnapshotGeneration;if(!packet20SnapshotGeneration)++packet20SnapshotGeneration;
      packet20SnapshotState=Packet20SnapshotState::REQUESTED;queued=true;
    }
    portEXIT_CRITICAL(&packet20SnapshotMux);
    return queued;
  }
  if(!strcmp(op,"restore")) {
    if(!command["snapshotId"].is<uint32_t>())return false;
    bool queued=false;
    portENTER_CRITICAL(&packet20SnapshotMux);
    if(packet20SavedValid&&packet20SnapshotState==Packet20SnapshotState::READY&&
       !packet20RestoreRequested&&command["snapshotId"].as<uint32_t>()==packet20SnapshotId) {
      packet20RestoreRequested=true;packet20RestoreVerified=false;queued=true;
    }
    portEXIT_CRITICAL(&packet20SnapshotMux);
    return queued;
  }
  return false;
}
#endif

static void ensureFoundationMatrixSegment() {
  if (strip.getSegmentsNum() == 0 || foundationEffectId == 255) return;

  // WLED applies its configured boot preset in beginStrip() before usermod
  // setup. Take ownership after that restore and cancel any restored playlist
  // on every loop so it cannot reassert an ordinary WLED effect on segment 0.
  if (currentPlaylist >= 0) unloadPlaylist();
  Segment& matrix = strip.getSegment(0);
  if (matrix.mode != foundationEffectId) matrix.setMode(foundationEffectId);
  matrix.setOption(SEG_OPTION_ON, true);
}

static void ensureCompanionSegment() {
  if (strip.getSegmentsNum() < 2) strip.appendSegment(512,534);
  if (strip.getSegmentsNum() < 2) return;

  Segment& companion=strip.getSegment(1);
  if (companion.start != 512 || companion.stop != 534) companion.setGeometry(512,534);
  if (companion.mode != foundationEffectId) companion.setMode(foundationEffectId);
  companion.setOption(SEG_OPTION_ON,true);
  companion.setOpacity(255);

  for (size_t i=2;i<strip.getSegmentsNum();++i) {
    Segment& extra=strip.getSegment(i);
    if (extra.start == 512 && extra.stop == 534) extra.deactivate();
  }
}

static Rgb8 fieldColor(const CanonicalFrame& f,uint16_t x,uint16_t y,uint16_t width,uint16_t height) {
  return renderFoundationPixel(f,x,y,width,height);
}

static uint32_t packed(const Rgb8& c) {
  return RGBW32(c.r,c.g,c.b,0);
}

static void mode_hbnf_foundation(void) {
  const bool matrixSegment=SEGMENT.start==0;
  if(matrixSegment){hbnfPerfWorking=HbnfPerfFrame{};hbnfPerfWorking.active=true;hbnfPerfWorking.start=hbnfCycles();
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
    hbnfTraceStartFrame();
#endif
  }
  const uint32_t schedulerStart=hbnfCycles();
  const CanonicalFrame& f=runtime.frame();
  if(matrixSegment){hbnfPerfWorking.scheduler+=hbnfCycles()-schedulerStart;hbnfPerfWorking.kernel=f.variant.kernel;hbnfPerfWorking.variant=f.variant.signature;
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
    if(hbnfTraceFrameActive)hbnfTraceFrame=&f;
#endif
  }

  // The virtual type-80 bus is Matrix segment 1. Handle it before asking WLED
  // whether the segment is 2D: mapped DDP segments can inherit 2D dimensions.
  if (SEGMENT.start == 512 && SEGLEN == 22) {
    const uint32_t companionStart=hbnfCycles();
    Rgb8 companion[22]{};
    renderCompanion22(f,[](const CanonicalFrame& frame,uint16_t x,uint16_t y) {
      return canonicalMatrixFrame==frame.frame?canonicalMatrixPixels[y*32u+x]:Rgb8{};
    },companion);
    uint8_t nonzero=0;
    for(uint16_t i=0;i<22;i++) {
      if(companion[i].r||companion[i].g||companion[i].b) nonzero++;
      SEGMENT.setPixelColor(i,packed(companion[i]));
    }
    companionLastNonzero=nonzero;
    companionRenderCount++;
    hbnfPerfWorking.companionPrep+=hbnfCycles()-companionStart;
    return;
  }

  if (SEGMENT.is2D()) {
    foundationAnimartrix.beginFrame(f,millis());
    foundationAnimartrix.render(f.variant.kernel,f.variant.speed);
    const uint32_t overlayStart=hbnfCycles();
    if(!hbnfRenderCommandOverlay(f.controls.matrixBrightness,f.vibe))hbnfRenderLiveOverlay(f.controls.matrixBrightness);
    hbnfPerfWorking.overlay+=hbnfCycles()-overlayStart;
#if defined(HBNF_PACKET20_DIAGNOSTICS)
    if(matrixSegment)packet20ServiceAtRendererSafePoint();
#endif
    return;
  }

  const uint16_t len=SEGLEN;
  for(uint16_t i=0;i<len;i++) {
    uint16_t x=0,y=0;
    if(len==22) perimeterCoord22((uint8_t)i,x,y);
    else { x=(uint16_t)(((uint32_t)i*31u)/(len>1?len-1:1)); y=15; }
    Rgb8 c=fieldColor(f,x,y,32,16);
    const Rgb8 gammaCorrected=SEGMENT.check2?Rgb8(gamma8(c.r),gamma8(c.g),gamma8(c.b)):c;
    SEGMENT.setPixelColor(i,packed(hbnf_brightness::scaleOutputPixel(gammaCorrected,c,hbnf_brightness::outputScale(f.controls.matrixBrightness))));
  }
}

static Scene sceneFrom(JsonVariantConst v,Scene fallback) {
  if (v.is<const char*>()) {
    const char* s=v.as<const char*>();
    if (!strcmp(s,"course-flow")) return COURSE_FLOW;
    if (!strcmp(s,"field-mix")) return FIELD_MIX;
    if (!strcmp(s,"hbnf-signature")) return SIGNATURE;
    if (!strcmp(s,"quiet-cosmos")) return QUIET_COSMOS;
    return fallback;
  }
  if (v.is<int>()) {
    int n=v.as<int>(); if(n<0)n=0; if(n>3)n=3;
    return (Scene)n;
  }
  return fallback;
}

static bool vibeFrom(JsonVariantConst v,Vibe& out) {
  if(v.is<int>()) { const int n=v.as<int>();if(n<0||n>(int)VIBE_AUTO)return false;out=(Vibe)n;return true; }
  if(!v.is<const char*>())return false;
  const char* s=v.as<const char*>();
  if(!strcmp(s,"chill"))out=VIBE_CHILL;
  else if(!strcmp(s,"groove"))out=VIBE_GROOVE;
  else if(!strcmp(s,"heavy"))out=VIBE_HEAVY;
  else if(!strcmp(s,"psychedelic"))out=VIBE_PSYCHEDELIC;
  else if(!strcmp(s,"cosmic"))out=VIBE_COSMIC;
  else if(!strcmp(s,"auto"))out=VIBE_AUTO;
  else return false;
  return true;
}

class HbnfFoundationV1Usermod : public Usermod {
  bool routeRegistered_=false;
 public:
  void setup() override {
    noWifiSleep=true;
    const uint32_t seed=(uint32_t)ESP.getEfuseMac() ^ esp_random() ^ micros();
    runtime.initialize(seed,millis());
    // Reserve WLED master brightness and segment opacity for transport/headroom.
    // Independent HBNF sliders apply in the Matrix renderer and before DDP.
    bri=255; briLast=255; strip.setBrightness(255,true);
    for (size_t i=0;i<strip.getSegmentsNum();++i) {
      Segment& seg=strip.getSegment(i);
      if (seg.isActive()) { seg.setOpacity(255); seg.setOption(SEG_OPTION_ON,true); }
    }
    foundationEffectId=strip.addEffect(255,&mode_hbnf_foundation,HBNF_FX_DATA);
    ensureFoundationMatrixSegment();
    ensureCompanionSegment();
  }

  void addToConfig(JsonObject& root) override {
    JsonObject h=root.createNestedObject("hbnfFoundationV1");
    h["matrixBrightness"]=runtime.controls().matrixBrightness;
    h["auxBrightness"]=runtime.controls().auxBrightness;
    h["vibe"]=(uint8_t)runtime.controls().vibe;
  }

  bool readFromConfig(JsonObject& root) override {
    JsonObject h=root["hbnfFoundationV1"];
    bool complete=!h.isNull() && !h["matrixBrightness"].isNull() && !h["auxBrightness"].isNull();
    uint8_t matrix=h["matrixBrightness"] | 24;
    uint8_t aux=h["auxBrightness"] | 24;
    runtime.restoreSettings(matrix,aux);
    if(!h["vibe"].isNull()&&h["vibe"].is<int>()&&h["vibe"].as<int>()>=0&&h["vibe"].as<int>()<=(int)VIBE_AUTO)
      runtime.controls().vibe=(Vibe)h["vibe"].as<int>();
    return complete;
  }

  void connected() override {
    if(routeRegistered_) return;
    server.on("/hbnf/favicon-16.png",HTTP_GET,[](AsyncWebServerRequest* request){
      AsyncWebServerResponse* response=request->beginResponse_P(200,"image/png",HBNF_HOME_SCREEN_FAVICON_16_PNG,sizeof(HBNF_HOME_SCREEN_FAVICON_16_PNG));
      response->addHeader("Cache-Control","public, max-age=31536000, immutable");
      request->send(response);
    });
    server.on("/hbnf/favicon-32.png",HTTP_GET,[](AsyncWebServerRequest* request){
      AsyncWebServerResponse* response=request->beginResponse_P(200,"image/png",HBNF_HOME_SCREEN_FAVICON_32_PNG,sizeof(HBNF_HOME_SCREEN_FAVICON_32_PNG));
      response->addHeader("Cache-Control","public, max-age=31536000, immutable");
      request->send(response);
    });
    server.on("/hbnf/favicon-48.png",HTTP_GET,[](AsyncWebServerRequest* request){
      AsyncWebServerResponse* response=request->beginResponse_P(200,"image/png",HBNF_HOME_SCREEN_FAVICON_48_PNG,sizeof(HBNF_HOME_SCREEN_FAVICON_48_PNG));
      response->addHeader("Cache-Control","public, max-age=31536000, immutable");
      request->send(response);
    });
    server.on("/hbnf/icon.png",HTTP_GET,[](AsyncWebServerRequest* request){
      AsyncWebServerResponse* response=request->beginResponse_P(200,"image/png",HBNF_HOME_SCREEN_ICON_PNG,sizeof(HBNF_HOME_SCREEN_ICON_PNG));
      response->addHeader("Cache-Control","public, max-age=31536000, immutable");
      request->send(response);
    });
    server.on("/hbnf/build.json",HTTP_GET,[](AsyncWebServerRequest* request){
      AsyncWebServerResponse* response=request->beginResponse_P(200,"application/json",HBNF_BUILD_JSON);
      response->addHeader("Cache-Control","no-store");
      request->send(response);
    });
    server.on("/hbnf",HTTP_GET,[](AsyncWebServerRequest* request){
      AsyncWebServerResponse* response=request->beginResponse_P(200,FPSTR(CONTENT_TYPE_HTML),HBNF_LOCAL_UI);
      response->addHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");
      response->addHeader("Pragma","no-cache");
      response->addHeader("Expires","0");
      request->send(response);
    });
    AsyncCallbackJsonWebHandler* liveHandler=new AsyncCallbackJsonWebHandler("/hbnf/live",[](AsyncWebServerRequest* request){
      AsyncWebHeader* origin=request->getHeader("Origin");
      AsyncWebHeader* host=request->getHeader("Host");
      const String expectedOrigin=host?(String("http://")+host->value()):String("");
      if(!origin||expectedOrigin.isEmpty()||origin->value()!=expectedOrigin) {
        request->send(403,"application/json","{\"ok\":false}");
        return;
      }
      DynamicJsonDocument doc(2048);
      DeserializationError error=deserializeJson(doc,(const uint8_t*)request->_tempObject);
      if(error||!hbnfAcceptLiveSnapshot(doc.as<JsonObjectConst>())) {
        request->send(400,"application/json","{\"ok\":false}");
        return;
      }
      request->send(200,"application/json","{\"ok\":true}");
    },1536);
    liveHandler->setMethod(HTTP_POST);
    liveHandler->setMaxContentLength(1536);
    server.addHandler(liveHandler);
    routeRegistered_=true;
  }

  void loop() override {
    runtime.tick(millis());
    ensureFoundationMatrixSegment();
    ensureCompanionSegment();
    // WLED boot presets and its standard UI may rewrite global/segment brightness.
    // Keep both bus paths at unity; only the two HBNF-owned scales dim the outputs.
    if (bri != 255 || briLast != 255) { bri=255; briLast=255; strip.setBrightness(255,true); }
    for (size_t i=0;i<strip.getSegmentsNum();++i) {
      Segment& seg=strip.getSegment(i);
      if (seg.isActive() && (seg.opacity!=255 || !seg.on)) { seg.setOpacity(255); seg.setOption(SEG_OPTION_ON,true); }
    }
  }

  void addToJsonState(JsonObject& root) override {
    JsonObject h=root["HBNF"];
    if(h.isNull()) h=root.createNestedObject("HBNF");
    const Controls& c=runtime.controls();
    const AudioFrame& a=runtime.lastAudio();
    h["schema"]="foundation-v1";
    h["candidate"]=FPSTR(HBNF_CANDIDATE);
    h["transport"]="wled-native-ddp-unicast";
    h["effectId"]=foundationEffectId;
    h["scene"]=(uint8_t)c.scene;
    h["vibe"]=(uint8_t)c.vibe;
    h["activeVibe"]=(uint8_t)runtime.resolvedVibe();
    h["motion"]=c.motion;
    h["audioResponse"]=c.audioResponse;
    h["matrixBrightness"]=c.matrixBrightness;
    h["auxBrightness"]=c.auxBrightness;
    JsonObject palette=h["palette"];
    if(palette.isNull())palette=h.createNestedObject("palette");
    palette["mode"]=hbnfPalette.mode==PALETTE_WLED?"wled":(hbnfPalette.mode==PALETTE_SOLID?"solid":"legacy");
    if(hbnfPalette.mode==PALETTE_WLED)palette["index"]=hbnfPalette.index;
    if(hbnfPalette.mode==PALETTE_SOLID){JsonArray rgb=palette.createNestedArray("rgb");rgb.add(hbnfPalette.r);rgb.add(hbnfPalette.g);rgb.add(hbnfPalette.b);}
    OverlayState overlay;portENTER_CRITICAL(&hbnfOverlayMux);overlay=hbnfCommandOverlay;portEXIT_CRITICAL(&hbnfOverlayMux);
    if(overlayVisible(overlay,millis()))h["overlayId"]=overlay.id;else h["overlayId"]=nullptr;
    h["kernel"]=runtime.variant().kernel;
    h["variantSignature"]=runtime.variant().signature;
    h["variantDwellSeconds"]=runtime.variant().dwellSeconds;
#if defined(HBNF_PACKET20_DIAGNOSTICS)
    JsonObject p20=h.createNestedObject("packet20Diagnostic");
    p20["enabled"]=runtime.diagnosticActive();p20["selectedKernel"]=runtime.variant().kernel;
    p20["snapshotValid"]=packet20SavedValid;p20["snapshotId"]=packet20SnapshotId;
    Packet20SnapshotState snapshotState;portENTER_CRITICAL(&packet20SnapshotMux);snapshotState=packet20SnapshotState;portEXIT_CRITICAL(&packet20SnapshotMux);
    p20["snapshotState"]=packet20SnapshotStateName(snapshotState);p20["snapshotGeneration"]=packet20SnapshotGeneration;
    p20["snapshotHash"]=packet20SnapshotHash;p20["restoreVerified"]=packet20RestoreVerified;
    p20["lastCommand"]=packet20LastCommand;p20["lastCommandAccepted"]=packet20LastCommandAccepted;
    // Raw ESP reset evidence for one bounded diagnostic boot; no heuristics.
    p20["resetReasonCore0"]=(int)rtc_get_reset_reason(0);
    p20["resetReasonCore1"]=(int)rtc_get_reset_reason(1);
    p20["espResetReason"]=(int)esp_reset_reason();
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
    hbnfTraceJson(p20);
#endif
#endif
    h["companionRenderCount"]=(uint32_t)companionRenderCount;
    h["companionLastNonzeroPixels"]=companionLastNonzero;
    HbnfPerfFrame perf; portENTER_CRITICAL(&hbnfPerfMux); perf=hbnfPerfLatest; portEXIT_CRITICAL(&hbnfPerfMux);
    JsonObject timing=h.createNestedObject("timing");
    timing["kernel"]=perf.kernel; timing["variantSignature"]=perf.variant;
    timing["wholeFrameUs"]=hbnfCycleUs(perf.whole);
    timing["kernelRenderUs"]=hbnfCycleUs(perf.kernelGross>perf.audioInKernel+perf.colorInKernel?perf.kernelGross-perf.audioInKernel-perf.colorInKernel:0);
    timing["audioModulationUs"]=hbnfCycleUs(perf.audio);
    timing["schedulerVariantUs"]=hbnfCycleUs(perf.scheduler);
    timing["paletteColorUs"]=hbnfCycleUs(perf.color);
    timing["overlayUs"]=hbnfCycleUs(perf.overlay);
    timing["companionPrepUs"]=hbnfCycleUs(perf.companionPrep);
    timing["companionDdpSendUs"]=hbnfCycleUs(perf.ddpSend);
    timing["auxProjectionAgeMs"]=(uint32_t)(millis()-hbnfLastDdpSendMs);
    timing["unaccountedUs"]=hbnfCycleUs(perf.unaccounted);
    timing["fps"]=strip.getFps(); timing["companionRenderCount"]=(uint32_t)companionRenderCount;
    timing["freeHeap"]=ESP.getFreeHeap(); timing["rssi"]=WiFi.RSSI(); timing["uptimeSec"]=millis()/1000u;
#if defined(HBNF_PACKET20_DIAGNOSTICS)
    JsonObject foundationTelemetry=h.createNestedObject("foundationTelemetry");
    bool tailsEnabled,tailOverflow=false;uint16_t tailCount;uint8_t tailKernel;double q[8][3]{};double maxima[8]{};double averages[8]{};
    portENTER_CRITICAL(&hbnfTailMux);tailsEnabled=hbnfTailEnabled;tailCount=hbnfTailCount;tailKernel=hbnfTailKernel;
    if(tailsEnabled&&tailCount){
      for(uint8_t metric=0;metric<8;metric++){
        tailOverflow|=hbnfTailHist[metric][HBNF_TAIL_BINS-1]!=0;
        const uint16_t targets[3]={(uint16_t)((tailCount+1)/2),(uint16_t)((95u*tailCount+99u)/100u),(uint16_t)((99u*tailCount+99u)/100u)};
        uint32_t cumulative=0;uint8_t qFound=0;
        for(uint16_t bin=0;bin<HBNF_TAIL_BINS;bin++){
          cumulative+=hbnfTailHist[metric][bin];
          while(qFound<3&&cumulative>=targets[qFound]){q[metric][qFound]=(bin*HBNF_TAIL_BIN_US+HBNF_TAIL_BIN_US/2)/1000.0;qFound++;}
        }
        averages[metric]=(double)hbnfTailSum[metric]/(1000.0*tailCount);maxima[metric]=hbnfTailMax[metric]/1000.0;
      }
    }
    portEXIT_CRITICAL(&hbnfTailMux);
    foundationTelemetry["enabled"]=tailsEnabled;foundationTelemetry["sampleCount"]=tailCount;foundationTelemetry["kernelId"]=tailKernel;
    foundationTelemetry["minimumFreeHeapBytes"]=esp_get_minimum_free_heap_size();
    foundationTelemetry["largestFreeBlockBytes"]=heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
    if(tailsEnabled&&tailCount){
      foundationTelemetry["frameMsAvg"]=averages[0];foundationTelemetry["frameMsP50"]=q[0][0];foundationTelemetry["frameMsP95"]=q[0][1];foundationTelemetry["frameMsP99"]=q[0][2];foundationTelemetry["frameMsMax"]=maxima[0];
      const char* stageP95[7]={"kernelMsP95","paletteMsP95","audioMsP95","schedulerMsP95","overlayMsP95","auxPrepareSendMsP95","unaccountedMsP95"};
      const char* stageAvg[7]={"kernelMsAvg","paletteMsAvg","audioMsAvg","schedulerMsAvg","overlayMsAvg","auxPrepareSendMsAvg","unaccountedMsAvg"};
      for(uint8_t stage=0;stage<7;stage++){foundationTelemetry[stageP95[stage]]=q[stage+1][1];foundationTelemetry[stageAvg[stage]]=averages[stage+1];}
      foundationTelemetry["frameTailBinResolutionUs"]=HBNF_TAIL_BIN_US;
      foundationTelemetry["frameTailOverflow"]=tailOverflow;
    }else{foundationTelemetry["frameMsAvg"]=nullptr;foundationTelemetry["frameMsP50"]=nullptr;foundationTelemetry["frameMsP95"]=nullptr;foundationTelemetry["frameMsP99"]=nullptr;foundationTelemetry["frameMsMax"]=nullptr;}
#endif
    HbnfLiveSnapshot live;
    portENTER_CRITICAL(&hbnfLiveMux);live=hbnfLive;portEXIT_CRITICAL(&hbnfLiveMux);
    h["liveActive"]=live.active&&(uint32_t)(millis()-live.lastSeenMs)<120000u;
    h["liveLabel"]=live.label;
    h["liveAcePot"]=live.acePot;
    h["liveEntryCount"]=live.count;
    JsonObject audio=h["audio"];
    if(audio.isNull()) audio=h.createNestedObject("audio");
    audio["bass"]=a.bass;
    audio["mid"]=a.mid;
    audio["treble"]=a.treble;
    audio["volume"]=a.volume;
    audio["peak"]=a.peak;
  }

  void readFromJsonState(JsonObject& root) override {
    if(!root["on"].isNull()&&!root["on"].as<bool>()) {
      portENTER_CRITICAL(&hbnfOverlayMux);clearOverlay(hbnfCommandOverlay);portEXIT_CRITICAL(&hbnfOverlayMux);
    }
    JsonObject h=root["HBNF"];
    if(h.isNull()) return;
#if defined(HBNF_PACKET20_DIAGNOSTICS)
    if(!h["foundationTelemetry"]["enabled"].isNull()) {
      if(!hbnfTailSetEnabled(h["foundationTelemetry"]["enabled"].as<bool>()))return;
    }
    if(h.containsKey("packet20Diagnostic")) {
      JsonObjectConst command=h["packet20Diagnostic"].as<JsonObjectConst>();
      strlcpy(packet20LastCommand,command["op"]|"invalid",sizeof(packet20LastCommand));
      packet20LastCommandAccepted=packet20Command(command);
      if(!packet20LastCommandAccepted)return;
    }
#endif
    if(h.containsKey("palette"))hbnfApplyPalette(h["palette"]);
    if(h.containsKey("overlay"))hbnfAcceptOverlay(h["overlay"],h["overlay"].isNull(),millis());
    Controls& c=runtime.controls();
    bool renderChanged=false,settingsChanged=false;
    if(!h["motion"].isNull()) { uint8_t v=(uint8_t)constrain(h["motion"].as<int>(),0,100); renderChanged|=v!=c.motion; c.motion=v; }
    if(!h["audioResponse"].isNull()) { uint8_t v=(uint8_t)constrain(h["audioResponse"].as<int>(),0,100); renderChanged|=v!=c.audioResponse; c.audioResponse=v; }
    if(!h["matrixBrightness"].isNull()) { uint8_t v=(uint8_t)constrain(h["matrixBrightness"].as<int>(),0,255); settingsChanged|=v!=c.matrixBrightness; c.matrixBrightness=v; }
    if(!h["auxBrightness"].isNull()) { uint8_t v=(uint8_t)constrain(h["auxBrightness"].as<int>(),0,255); settingsChanged|=v!=c.auxBrightness; c.auxBrightness=v; }
    bool vibeChanged=false;
    if(!h["vibe"].isNull()) { Vibe requested;if(vibeFrom(h["vibe"],requested)&&requested!=c.vibe){runtime.selectVibe(requested,millis());renderChanged=true;vibeChanged=true;} }
    Scene previous=c.scene;
    if(!h["scene"].isNull()) c.scene=sceneFrom(h["scene"],c.scene);
    if(previous!=c.scene) { runtime.chooseSceneVariant(millis()); renderChanged=true; }
    if(settingsChanged||vibeChanged) runtime.markConfigDirty(millis());
    if(settingsChanged || renderChanged) { runtime.invalidateFrame(); stateChanged=true; }
    bri=255; briLast=255;
    strip.setBrightness(255,true);
  }

  uint16_t getId() override { return USERMOD_ID_USER_FX; }
};

static HbnfFoundationV1Usermod hbnfFoundationV1;
REGISTER_USERMOD(hbnfFoundationV1);

 } // namespace

extern "C" void hbnfPerfDdpStart() { if(hbnfPerfWorking.active)hbnfPerfWorking.ddpStart=hbnfCycles(); }
extern "C" void hbnfPerfDdpEnd() { if(hbnfPerfWorking.active&&hbnfPerfWorking.ddpStart){hbnfPerfWorking.ddpSend+=hbnfCycles()-hbnfPerfWorking.ddpStart;hbnfLastDdpSendMs=millis();} }
extern "C" void hbnfPerfFrameEnd() {
  if(!hbnfPerfWorking.active)return;
  const uint32_t end=hbnfCycles(); hbnfPerfWorking.whole=end-hbnfPerfWorking.start;
  const uint64_t accounted=(uint64_t)hbnfPerfWorking.scheduler+(hbnfPerfWorking.kernelGross>hbnfPerfWorking.audioInKernel+hbnfPerfWorking.colorInKernel?hbnfPerfWorking.kernelGross-hbnfPerfWorking.audioInKernel-hbnfPerfWorking.colorInKernel:0)+hbnfPerfWorking.audio+hbnfPerfWorking.color+hbnfPerfWorking.overlay+hbnfPerfWorking.companionPrep+hbnfPerfWorking.ddpSend;
  hbnfPerfWorking.unaccounted=accounted<hbnfPerfWorking.whole?(uint32_t)(hbnfPerfWorking.whole-accounted):0;
#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)
  hbnfTraceEndFrame();
#endif
#if defined(HBNF_PACKET20_DIAGNOSTICS)
  portENTER_CRITICAL(&hbnfTailMux);
  if(hbnfTailEnabled){
    if(hbnfTailKernel!=hbnfPerfWorking.kernel){hbnfTailKernel=hbnfPerfWorking.kernel;hbnfTailCount=0;memset(hbnfTailHist,0,sizeof(hbnfTailHist));memset(hbnfTailSum,0,sizeof(hbnfTailSum));memset(hbnfTailMax,0,sizeof(hbnfTailMax));}
    if(hbnfTailCount>=60000){for(uint8_t m=0;m<8;m++){for(uint16_t b=0;b<HBNF_TAIL_BINS;b++)hbnfTailHist[m][b]/=2;hbnfTailSum[m]/=2;}hbnfTailCount/=2;}
    uint32_t values[8]={hbnfCycleUs(hbnfPerfWorking.whole),hbnfCycleUs(hbnfPerfWorking.kernelGross>hbnfPerfWorking.audioInKernel+hbnfPerfWorking.colorInKernel?hbnfPerfWorking.kernelGross-hbnfPerfWorking.audioInKernel-hbnfPerfWorking.colorInKernel:0),hbnfCycleUs(hbnfPerfWorking.color),hbnfCycleUs(hbnfPerfWorking.audio),hbnfCycleUs(hbnfPerfWorking.scheduler),hbnfCycleUs(hbnfPerfWorking.overlay),hbnfCycleUs(hbnfPerfWorking.companionPrep+hbnfPerfWorking.ddpSend),hbnfCycleUs(hbnfPerfWorking.unaccounted)};
    for(uint8_t metric=0;metric<8;metric++){uint16_t bin=values[metric]/HBNF_TAIL_BIN_US;if(bin>=HBNF_TAIL_BINS)bin=HBNF_TAIL_BINS-1;if(hbnfTailHist[metric][bin]!=UINT16_MAX)hbnfTailHist[metric][bin]++;hbnfTailSum[metric]+=values[metric];if(values[metric]>hbnfTailMax[metric])hbnfTailMax[metric]=values[metric];}
    if(hbnfTailCount<UINT16_MAX)hbnfTailCount++;
  }
  portEXIT_CRITICAL(&hbnfTailMux);
#endif
  portENTER_CRITICAL(&hbnfPerfMux); hbnfPerfLatest=hbnfPerfWorking; portEXIT_CRITICAL(&hbnfPerfMux);
  hbnfPerfWorking.active=false;
}
