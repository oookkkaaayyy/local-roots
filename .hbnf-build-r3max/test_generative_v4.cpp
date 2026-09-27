#include <cassert>
#include <cstdint>
#include <cstdio>
#include <set>
#include <vector>
#include "hbnf_generative_v4.h"

int main(){
  using namespace hbnf;
  for(int d=0;d<4;d++){
    GenerativeV4 g(0xA5A50000u+(uint32_t)d);
    std::vector<uint8_t> recent;
    std::vector<uint8_t> recentFamilies;
    std::vector<uint8_t> recentPalettes;
    std::vector<uint8_t> recentWarps;
    std::set<uint8_t> effects;
    std::set<uint8_t> families;
    std::set<uint32_t> signatures;
    uint32_t minSig=0xffffffffu;
    for(int i=0;i<5000;i++){
      auto v=g.next((GenerativeDomain)d);
      assert(v.effectId>=220 && v.effectId<=247);
      assert(v.amount>=218);
      assert(((v.variantCode>>3)&3u)==d);
      const uint8_t warp=(uint8_t)(v.variantCode>>5);
      assert(warp<8);
      for(size_t k=(recent.size()>22?recent.size()-22:0);k<recent.size();k++) assert(recent[k]!=v.effectId);
      if(!recentFamilies.empty()) assert(recentFamilies.back()!=v.familyId);
      for(size_t k=(recentPalettes.size()>2?recentPalettes.size()-2:0);k<recentPalettes.size();k++) assert(recentPalettes[k]!=v.palette);
      if(!recentWarps.empty()) assert(recentWarps.back()!=warp);
      recent.push_back(v.effectId);
      recentFamilies.push_back(v.familyId);
      recentPalettes.push_back(v.palette);
      recentWarps.push_back(warp);
      effects.insert(v.effectId);
      families.insert(v.familyId);
      assert(signatures.insert(v.signature).second);
      if(v.signature<minSig) minSig=v.signature;
      switch(d){
        case 1: assert(v.speed>=118&&v.speed<=176); assert(v.dwellSeconds>=8&&v.dwellSeconds<=18); break;
        case 2: assert(v.speed>=102&&v.speed<=158); assert(v.dwellSeconds>=9&&v.dwellSeconds<=21); break;
        case 3: assert(v.speed>=72&&v.speed<=126); assert(v.dwellSeconds>=12&&v.dwellSeconds<=28); break;
        default: assert(v.speed>=96&&v.speed<=166); assert(v.dwellSeconds>=9&&v.dwellSeconds<=23); break;
      }
    }
    assert(effects.size()==28);
    assert(families.size()>=8);
    assert(signatures.size()==5000);
    printf("domain=%d variants=5000 effects=28 families=%zu exact_signature_repeats=0\n",d,families.size());
  }
  puts("PASS generative-v4 perceptual anti-repeat: 22-kernel hard memory + no adjacent family/warp + 2-palette memory");
}
