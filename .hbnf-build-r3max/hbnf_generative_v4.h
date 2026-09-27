#pragma once
#include <stdint.h>
#include <stddef.h>

namespace hbnf {

enum GenerativeDomain : uint8_t {
  DOMAIN_COURSE_FLOW=0,
  DOMAIN_FIELD_MIX=1,
  DOMAIN_SIGNATURE=2,
  DOMAIN_QUIET_COSMOS=3
};

struct GenerativeVariant {
  uint8_t effectId=220;
  uint8_t speed=128;
  uint8_t profile=96;
  uint8_t style=176;
  uint8_t amount=210;
  uint8_t palette=0;
  uint8_t variantCode=0; // high 2 bits domain, low 3 bits spatial transform
  uint16_t offset=0;     // salt / phase seed
  uint16_t dwellSeconds=14;
  uint32_t signature=0;
};

class GenerativeV4 {
 public:
  static const uint8_t EFFECT_FIRST=220;
  static const uint8_t EFFECT_COUNT=28;
  static const uint8_t RECENT_EFFECTS=22;
  static const uint8_t RECENT_SIGNATURES=32;

  explicit GenerativeV4(uint32_t seed=0x48B4F19Du){ reset(seed); }

  void reset(uint32_t seed){
    rng_=seed?seed:0x48B4F19Du;
    effectPos_=sigPos_=0;
    effectCount_=sigCount_=0;
    for(uint8_t &v:recentEffects_) v=255;
    for(uint32_t &v:recentSignatures_) v=0;
  }

  GenerativeVariant next(GenerativeDomain domain){
    for(uint8_t attempt=0;attempt<96;attempt++){
      GenerativeVariant v=make(domain);
      if(effectRecently(v.effectId)) continue;
      if(signatureRecently(v.signature)) continue;
      remember(v);
      return v;
    }
    // With 28 kernels and a 22-kernel exclusion window this should be unreachable.
    // Deterministic fallback relaxes only the effect window, never exact signatures.
    for(uint8_t attempt=0;attempt<96;attempt++){
      GenerativeVariant v=make(domain);
      if(effectRecentlyShort(v.effectId,8)) continue;
      if(signatureRecently(v.signature)) continue;
      remember(v);
      return v;
    }
    GenerativeVariant v=make(domain);
    remember(v);
    return v;
  }

 private:
  uint32_t rng_=0x48B4F19Du;
  uint8_t recentEffects_[RECENT_EFFECTS];
  uint32_t recentSignatures_[RECENT_SIGNATURES];
  uint8_t effectPos_=0,sigPos_=0,effectCount_=0,sigCount_=0;

  uint32_t rnd(){
    uint32_t x=rng_;
    x^=x<<13; x^=x>>17; x^=x<<5;
    rng_=x?x:0x9E3779B9u;
    return rng_;
  }
  uint8_t range8(uint8_t lo,uint8_t hi){
    return lo+(uint8_t)(rnd()%((uint32_t)hi-lo+1u));
  }
  uint16_t range16(uint16_t lo,uint16_t hi){
    return lo+(uint16_t)(rnd()%((uint32_t)hi-lo+1u));
  }
  template<size_t N> uint8_t pick(const uint8_t (&a)[N]){
    return a[rnd()%N];
  }

  GenerativeVariant make(GenerativeDomain domain){
    static const uint8_t profilesCourse[]={16,56,96,136,176,216};
    static const uint8_t stylesCourse[]={56,96,136,176,236};
    static const uint8_t profilesField[]={16,16,56,96,176,176,216};
    static const uint8_t stylesField[]={56,56,136,176,236,236};
    static const uint8_t profilesSignature[]={56,96,136,176,176,216};
    static const uint8_t stylesSignature[]={136,176,176,236,236};
    static const uint8_t profilesCosmos[]={56,96,136,136,176,216};
    static const uint8_t stylesCosmos[]={96,136,176,176,236};
    static const uint8_t palettes[]={1,6,7,8,9,10,11,12,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58,61,64,67,70};

    GenerativeVariant v;
    // All four domains draw from the full 28-kernel R3 engine. Domain changes
    // distributions, never the audio-capable renderer.
    v.effectId=(uint8_t)(EFFECT_FIRST+(rnd()%EFFECT_COUNT));
    const uint8_t transform=(uint8_t)(rnd()&7u);
    v.variantCode=(uint8_t)(((uint8_t)domain<<3)|transform);
    v.offset=(uint16_t)rnd();
    v.palette=pick(palettes);

    switch(domain){
      case DOMAIN_FIELD_MIX:
        v.speed=range8(118,176);
        v.profile=pick(profilesField);
        v.style=pick(stylesField);
        v.amount=range8(205,255);
        v.dwellSeconds=range16(8,18);
        break;
      case DOMAIN_SIGNATURE:
        v.speed=range8(102,158);
        v.profile=pick(profilesSignature);
        v.style=pick(stylesSignature);
        v.amount=range8(198,250);
        v.dwellSeconds=range16(9,21);
        break;
      case DOMAIN_QUIET_COSMOS:
        v.speed=range8(72,126);
        v.profile=pick(profilesCosmos);
        v.style=pick(stylesCosmos);
        v.amount=range8(188,238);
        v.dwellSeconds=range16(12,28);
        break;
      default:
        v.speed=range8(96,166);
        v.profile=pick(profilesCourse);
        v.style=pick(stylesCourse);
        v.amount=range8(195,255);
        v.dwellSeconds=range16(9,23);
        break;
    }

    // Signature includes every appearance-defining field. Offset carries the
    // large phase/tint salt so revisiting the same kernel still looks different.
    uint32_t h=2166136261u;
    const uint32_t vals[]={
      v.effectId,v.speed,v.profile,v.style,v.amount,v.palette,v.variantCode,
      (uint8_t)(v.offset&255u),(uint8_t)(v.offset>>8),v.dwellSeconds
    };
    for(uint32_t x:vals){ h^=x; h*=16777619u; }
    v.signature=h?h:1u;
    return v;
  }

  bool effectRecently(uint8_t fx) const{
    for(uint8_t i=0;i<effectCount_;i++) if(recentEffects_[i]==fx) return true;
    return false;
  }
  bool effectRecentlyShort(uint8_t fx,uint8_t n) const{
    if(effectCount_==0) return false;
    const uint8_t count=effectCount_<n?effectCount_:n;
    for(uint8_t k=0;k<count;k++){
      const uint8_t pos=(uint8_t)((effectPos_+RECENT_EFFECTS-1u-k)%RECENT_EFFECTS);
      if(recentEffects_[pos]==fx) return true;
    }
    return false;
  }
  bool signatureRecently(uint32_t sig) const{
    for(uint8_t i=0;i<sigCount_;i++) if(recentSignatures_[i]==sig) return true;
    return false;
  }
  void remember(const GenerativeVariant& v){
    recentEffects_[effectPos_]=v.effectId;
    effectPos_=(uint8_t)((effectPos_+1u)%RECENT_EFFECTS);
    if(effectCount_<RECENT_EFFECTS) effectCount_++;
    recentSignatures_[sigPos_]=v.signature;
    sigPos_=(uint8_t)((sigPos_+1u)%RECENT_SIGNATURES);
    if(sigCount_<RECENT_SIGNATURES) sigCount_++;
  }
};

} // namespace hbnf
