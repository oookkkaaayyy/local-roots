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
    std::set<uint8_t> effects;
    std::set<uint32_t> signatures;
    uint32_t minSig=0xffffffffu;
    for(int i=0;i<5000;i++){
      auto v=g.next((GenerativeDomain)d);
      assert(v.effectId>=220 && v.effectId<=247);
      assert(v.amount>=188);
      assert((v.variantCode>>3)==d);
      for(size_t k=(recent.size()>22?recent.size()-22:0);k<recent.size();k++) assert(recent[k]!=v.effectId);
      recent.push_back(v.effectId);
      effects.insert(v.effectId);
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
    assert(signatures.size()==5000);
    printf("domain=%d variants=5000 effects=28 exact_signature_repeats=0\n",d);
  }
  puts("PASS generative-v4 full-engine anti-repeat contract");
}
