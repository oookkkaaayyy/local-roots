#define HBNF_VIBE_CORE_TYPES_DEFINED 1
#include <assert.h>
#include <stdint.h>
#include <stdio.h>

namespace hbnf_v1 {
enum Vibe : uint8_t { VIBE_CHILL=0,VIBE_GROOVE=1,VIBE_HEAVY=2,VIBE_PSYCHEDELIC=3,VIBE_COSMIC=4,VIBE_AUTO=5 };
struct Rgb8 { uint8_t r=0,g=0,b=0; Rgb8()=default; Rgb8(uint8_t a,uint8_t c,uint8_t d):r(a),g(c),b(d){} };
struct AudioFrame { uint8_t bassPulse=0,midPulse=0,treblePulse=0,highDetail=0,spectralChange=0,slowEnergy=0,highEnergy=0,transient=0; };
struct VibeAxes { uint8_t structure=0,flow=0,depth=0,symmetry=0,detail=0,paletteMotion=0,density=0,negativeSpace=0,transitionEnergy=0; };
struct CanonicalFrame { Vibe vibe=VIBE_CHILL; VibeAxes vibeAxes{}; AudioFrame audio{}; uint32_t phaseQ16=0; };
static inline Rgb8 blend(Rgb8 a,Rgb8 b,uint8_t m){return Rgb8((uint16_t(a.r)*(255-m)+uint16_t(b.r)*m+127)/255,(uint16_t(a.g)*(255-m)+uint16_t(b.g)*m+127)/255,(uint16_t(a.b)*(255-m)+uint16_t(b.b)*m+127)/255);}
static inline Rgb8 scaleRgb(Rgb8 a,uint8_t m){return Rgb8((uint16_t(a.r)*m+127)/255,(uint16_t(a.g)*m+127)/255,(uint16_t(a.b)*m+127)/255);}
}

#include "../firmware/phase2/integration-r6/usermod/hbnf_vibe_runtime.h"

using namespace hbnf_v1;

static void require(bool ok,const char* message){if(!ok){fprintf(stderr,"FAIL %s\n",message);assert(ok);}}

int main(){
  VibeAudioFeatures extractor;
  VibeAudioInput input{};
  AudioFeatures features{};
  for(uint16_t i=0;i<64;i++)features=extractor.update(input,20);
  require(features.silenceConfidence>245,"silence confidence");
  require(features.activity==0,"silence activity");

  extractor.reset();input.silent=false;input.volume=0.5f;input.energy=0.7f;input.lowEnergy=0.65f;
  input.bassAtt=1.2f;input.bassPulse=0.85f;
  for(uint16_t i=0;i<64;i++)features=extractor.update(input,20);
  require(features.lowPressure>90,"bass pressure extracted");
  require(features.lowTransient>200,"bass transient extracted");

  VibeAxes chill=vibeResponse(VIBE_CHILL,features),groove=vibeResponse(VIBE_GROOVE,features),
    heavy=vibeResponse(VIBE_HEAVY,features),psy=vibeResponse(VIBE_PSYCHEDELIC,features),
    cosmic=vibeResponse(VIBE_COSMIC,features);
  require(heavy.structure>groove.structure,"Heavy has distinct structure from Groove");
  require(groove.flow>heavy.flow,"Groove has distinct flow from Heavy");
  require(cosmic.depth>heavy.depth,"Cosmic has distinct depth from Heavy");
  require(psy.paletteMotion!=chill.paletteMotion,"Psychedelic has distinct palette response");
  require(chill.negativeSpace>heavy.negativeSpace,"Chill has distinct negative space");

  AudioFeatures bassSignal{};bassSignal.lowPressure=245;bassSignal.lowTransient=232;bassSignal.energyMedium=190;
  AudioFeatures midSignal{};midSignal.midBody=220;midSignal.midChange=236;midSignal.activity=190;
  AudioFeatures highSignal{};highSignal.highDetail=230;highSignal.highTransient=238;highSignal.spectralChange=220;
  AudioFeatures sustainedSignal{};sustainedSignal.energySlow=230;sustainedSignal.energyMedium=160;sustainedSignal.activity=45;
  AudioFeatures quietSignal{};quietSignal.silenceConfidence=250;quietSignal.activity=0;
  const VibeAxes heavyBass=vibeResponse(VIBE_HEAVY,bassSignal);
  const VibeAxes grooveMids=vibeResponse(VIBE_GROOVE,midSignal);
  const VibeAxes psychedelicHighs=vibeResponse(VIBE_PSYCHEDELIC,highSignal);
  const VibeAxes cosmicSustain=vibeResponse(VIBE_COSMIC,sustainedSignal);
  const VibeAxes chillQuiet=vibeResponse(VIBE_CHILL,quietSignal);
  AudioFeatures activeReference{};activeReference.silenceConfidence=0;activeReference.activity=190;
  require(heavyBass.structure>vibeResponse(VIBE_HEAVY,AudioFeatures{}).structure+40,"bass causally increases Heavy structural pressure");
  require(grooveMids.flow>vibeResponse(VIBE_GROOVE,AudioFeatures{}).flow+30,"mids causally increase Groove flow");
  require(psychedelicHighs.detail>vibeResponse(VIBE_PSYCHEDELIC,AudioFeatures{}).detail+25,"treble causally increases Psychedelic detail");
  require(chillQuiet.negativeSpace>vibeResponse(VIBE_CHILL,activeReference).negativeSpace+8,"quiet input increases Chill negative space relative to active audio");
  require(psychedelicHighs.symmetry!=grooveMids.symmetry,"audio profiles alter geometry/symmetry distinctly");
  require(cosmicSustain.transitionEnergy!=heavyBass.transitionEnergy,"sustain and bass produce distinct transition response");
  CanonicalFrame cosmicFrame{};cosmicFrame.vibe=VIBE_COSMIC;cosmicFrame.vibeAxes=cosmicSustain;cosmicFrame.phaseQ16=0x12345678;
  const Rgb8 cosmicInput(170,94,211);
  const Rgb8 cosmicRest=composeVibeColor(cosmicInput,cosmicFrame,13,7);
  cosmicFrame.audio.slowEnergy=230;
  const Rgb8 cosmicSustainColor=composeVibeColor(cosmicInput,cosmicFrame,13,7);
  require(cosmicRest.r!=cosmicSustainColor.r||cosmicRest.g!=cosmicSustainColor.g||cosmicRest.b!=cosmicSustainColor.b,"sustained energy evolves Cosmic composition and intensity");

  CanonicalFrame psychedelicFrame{};psychedelicFrame.vibe=VIBE_PSYCHEDELIC;
  psychedelicFrame.vibeAxes=vibeResponse(VIBE_PSYCHEDELIC,highSignal);psychedelicFrame.phaseQ16=0x12345678;
  const Rgb8 psychedelicQuiet=composeVibeColor(cosmicInput,psychedelicFrame,13,7);
  psychedelicFrame.audio.highEnergy=230;psychedelicFrame.audio.transient=210;
  const Rgb8 psychedelicTreble=composeVibeColor(cosmicInput,psychedelicFrame,13,7);
  require(psychedelicQuiet.r!=psychedelicTreble.r||psychedelicQuiet.g!=psychedelicTreble.g||psychedelicQuiet.b!=psychedelicTreble.b,"high-band energy and transient alter Psychedelic composition");

  CanonicalFrame frame{};frame.vibeAxes=heavy;frame.audio.bassPulse=200;frame.phaseQ16=0x12345678;
  Rgb8 inputColor(170,94,211),out[5];
  for(uint8_t i=0;i<5;i++){frame.vibe=(Vibe)i;out[i]=composeVibeColor(inputColor,frame,13,7);}
  for(uint8_t i=0;i<5;i++)for(uint8_t j=i+1;j<5;j++)
    require(out[i].r!=out[j].r||out[i].g!=out[j].g||out[i].b!=out[j].b,"Vibes have distinct composition output");

  AutoVibeSelector automatic;automatic.reset(0);AudioFeatures heavyInput{};
  heavyInput.lowPressure=255;heavyInput.lowTransient=255;heavyInput.energyMedium=255;heavyInput.activity=255;
  require(automatic.update(heavyInput,44000)==VIBE_CHILL,"AUTO minimum dwell");
  require(automatic.update(heavyInput,45000)==VIBE_HEAVY,"AUTO switches on strong measured preference after dwell");
  require(vibeProfileCode(VIBE_CHILL)!=vibeProfileCode(VIBE_HEAVY),"Vibe audio profile mapping");
  require(vibeStyleCode(VIBE_GROOVE)!=vibeStyleCode(VIBE_PSYCHEDELIC),"Vibe audio style mapping");
  puts("PASS hbnf_vibe_runtime_host: WLED-derived features, five distinct renderer grammars, AUTO dwell, style/profile");
}
