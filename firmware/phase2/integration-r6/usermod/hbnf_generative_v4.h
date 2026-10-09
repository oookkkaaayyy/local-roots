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
  uint8_t familyId=0;    // perceptual kernel family, used for anti-familiarity memory
  uint8_t variantCode=0; // bits 0-2 base transform, 3-4 domain, 5-7 secondary warp
  uint16_t offset=0;     // salt / phase seed
  uint16_t dwellSeconds=14;
  uint32_t signature=0;
};

class GenerativeV4 {
 public:
  static const uint8_t EFFECT_FIRST=220;
  static const uint8_t EFFECT_COUNT=28;
  static const uint8_t RECENT_EFFECTS=22;
  static const uint8_t RECENT_FAMILIES=3;
  static const uint8_t RECENT_PALETTES=5;
  static const uint8_t RECENT_WARPS=2;
  static const uint8_t RECENT_SIGNATURES=64;

  explicit GenerativeV4(uint32_t seed=0x48B4F19Du){ reset(seed); }

  void reset(uint32_t seed){
    rng_=seed?seed:0x48B4F19Du;
    effectPos_=familyPos_=palettePos_=warpPos_=sigPos_=0;
    effectCount_=familyCount_=paletteCount_=warpCount_=sigCount_=0;
    for(uint8_t &v:recentEffects_) v=255;
    for(uint8_t &v:recentFamilies_) v=255;
    for(uint8_t &v:recentPalettes_) v=255;
    for(uint8_t &v:recentWarps_) v=255;
    for(uint32_t &v:recentSignatures_) v=0;
  }

  GenerativeVariant next(GenerativeDomain domain){
    // Tier 1: maximum perceptual separation.
    for(uint16_t attempt=0;attempt<192;attempt++){
      GenerativeVariant v=make(domain);
      if(effectRecently(v.effectId)) continue;
      if(familyRecently(v.familyId)) continue;
      if(paletteRecently(v.palette)) continue;
      if(warpRecently((uint8_t)(v.variantCode>>5))) continue;
      if(signatureRecently(v.signature)) continue;
      remember(v);
      return v;
    }

    // Tier 2: preserve the hard 22-kernel memory, but relax secondary
    // dimensions just enough to avoid a dead-end when the six eligible kernels
    // happen to cluster in recently used perceptual families.
    for(uint16_t attempt=0;attempt<256;attempt++){
      GenerativeVariant v=make(domain);
      if(effectRecently(v.effectId)) continue;
      if(familyRecentlyShort(v.familyId,1)) continue;
      if(paletteRecentlyShort(v.palette,2)) continue;
      if(warpRecentlyShort((uint8_t)(v.variantCode>>5),1)) continue;
      if(signatureRecently(v.signature)) continue;
      remember(v);
      return v;
    }

    // Tier 3: the kernel exclusion window and exact-signature memory are
    // non-negotiable. Never shorten the 22-kernel window merely to satisfy a
    // palette/family preference.
    for(uint16_t attempt=0;attempt<1024;attempt++){
      GenerativeVariant v=make(domain);
      if(effectRecently(v.effectId)) continue;
      if(signatureRecently(v.signature)) continue;
      remember(v);
      return v;
    }

    // Defensive fallback should be mathematically unreachable with 28 kernels
    // and a 22-kernel exclusion window. Keep searching rather than knowingly
    // emitting a familiar kernel.
    for(;;){
      GenerativeVariant v=make(domain);
      if(effectRecently(v.effectId) || signatureRecently(v.signature)) continue;
      remember(v);
      return v;
    }
  }

 private:
  uint32_t rng_=0x48B4F19Du;
  uint8_t recentEffects_[RECENT_EFFECTS];
  uint8_t recentFamilies_[RECENT_FAMILIES];
  uint8_t recentPalettes_[RECENT_PALETTES];
  uint8_t recentWarps_[RECENT_WARPS];
  uint32_t recentSignatures_[RECENT_SIGNATURES];
  uint8_t effectPos_=0,familyPos_=0,palettePos_=0,warpPos_=0,sigPos_=0;
  uint8_t effectCount_=0,familyCount_=0,paletteCount_=0,warpCount_=0,sigCount_=0;

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

  static uint8_t familyForEffect(uint8_t effectId){
    // Perceptual families, not implementation IDs. Prevents back-to-back
    // Kaleido/Blob/Wave/etc. variants from feeling like the same trick.
    static const uint8_t family[EFFECT_COUNT]={
      0,0,1,2,3,4,0,0,1,2,0,5,2,0,3,5,2,6,6,1,0,7,7,4,0,2,7,7
    };
    return (effectId>=EFFECT_FIRST && effectId<EFFECT_FIRST+EFFECT_COUNT)
      ? family[effectId-EFFECT_FIRST] : 7;
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
    v.familyId=familyForEffect(v.effectId);
    const uint8_t transform=(uint8_t)(rnd()&7u);
    const uint8_t warp=(uint8_t)(rnd()&7u);
    v.variantCode=(uint8_t)(((uint8_t)domain<<3)|transform|(uint8_t)(warp<<5));
    v.offset=(uint16_t)rnd();
    v.palette=pick(palettes);

    switch(domain){
      case DOMAIN_FIELD_MIX:
        v.speed=range8(118,176);
        v.profile=pick(profilesField);
        v.style=pick(stylesField);
        v.amount=range8(224,255);
        v.dwellSeconds=range16(40,80);
        break;
      case DOMAIN_SIGNATURE:
        v.speed=range8(102,158);
        v.profile=pick(profilesSignature);
        v.style=pick(stylesSignature);
        v.amount=range8(222,255);
        v.dwellSeconds=range16(50,100);
        break;
      case DOMAIN_QUIET_COSMOS:
        v.speed=range8(72,126);
        v.profile=pick(profilesCosmos);
        v.style=pick(stylesCosmos);
        v.amount=range8(218,250);
        v.dwellSeconds=range16(60,120);
        break;
      default:
        v.speed=range8(96,166);
        v.profile=pick(profilesCourse);
        v.style=pick(stylesCourse);
        v.amount=range8(224,255);
        v.dwellSeconds=range16(45,90);
        break;
    }

    // Signature includes every appearance-defining field. Offset carries the
    // large phase/tint salt so revisiting the same kernel still looks different.
    uint32_t h=2166136261u;
    const uint32_t vals[]={
      v.effectId,v.familyId,v.speed,v.profile,v.style,v.amount,v.palette,v.variantCode,
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
  bool familyRecently(uint8_t family) const{
    for(uint8_t i=0;i<familyCount_;i++) if(recentFamilies_[i]==family) return true;
    return false;
  }
  bool familyRecentlyShort(uint8_t family,uint8_t n) const{
    const uint8_t count=familyCount_<n?familyCount_:n;
    for(uint8_t k=0;k<count;k++){
      const uint8_t pos=(uint8_t)((familyPos_+RECENT_FAMILIES-1u-k)%RECENT_FAMILIES);
      if(recentFamilies_[pos]==family) return true;
    }
    return false;
  }
  bool paletteRecently(uint8_t pal) const{
    for(uint8_t i=0;i<paletteCount_;i++) if(recentPalettes_[i]==pal) return true;
    return false;
  }
  bool paletteRecentlyShort(uint8_t pal,uint8_t n) const{
    const uint8_t count=paletteCount_<n?paletteCount_:n;
    for(uint8_t k=0;k<count;k++){
      const uint8_t pos=(uint8_t)((palettePos_+RECENT_PALETTES-1u-k)%RECENT_PALETTES);
      if(recentPalettes_[pos]==pal) return true;
    }
    return false;
  }
  bool warpRecently(uint8_t warp) const{
    for(uint8_t i=0;i<warpCount_;i++) if(recentWarps_[i]==warp) return true;
    return false;
  }
  bool warpRecentlyShort(uint8_t warp,uint8_t n) const{
    const uint8_t count=warpCount_<n?warpCount_:n;
    for(uint8_t k=0;k<count;k++){
      const uint8_t pos=(uint8_t)((warpPos_+RECENT_WARPS-1u-k)%RECENT_WARPS);
      if(recentWarps_[pos]==warp) return true;
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
    recentFamilies_[familyPos_]=v.familyId;
    familyPos_=(uint8_t)((familyPos_+1u)%RECENT_FAMILIES);
    if(familyCount_<RECENT_FAMILIES) familyCount_++;
    recentPalettes_[palettePos_]=v.palette;
    palettePos_=(uint8_t)((palettePos_+1u)%RECENT_PALETTES);
    if(paletteCount_<RECENT_PALETTES) paletteCount_++;
    const uint8_t warp=(uint8_t)(v.variantCode>>5);
    recentWarps_[warpPos_]=warp;
    warpPos_=(uint8_t)((warpPos_+1u)%RECENT_WARPS);
    if(warpCount_<RECENT_WARPS) warpCount_++;
    recentSignatures_[sigPos_]=v.signature;
    sigPos_=(uint8_t)((sigPos_+1u)%RECENT_SIGNATURES);
    if(sigCount_<RECENT_SIGNATURES) sigCount_++;
  }
};

} // namespace hbnf
