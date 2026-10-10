#include "../../firmware/phase2/integration-r6/usermod/hbnf_outlier_trace.h"
#include <assert.h>
#include <stdio.h>
#include <stddef.h>

using namespace hbnf_r6_outlier_trace;

int main() {
  static_assert(sizeof(Store<16>) + sizeof(ReferenceStore<4>) + sizeof(Record) + 128u <= 6656u,
                "trace plus bounded metadata/context exceeds 6.5 KiB budget");
  Store<3> s;
  assert(!s.append(Record{}));
  assert(!s.worstValid() && s.count()==0 && s.outlierCount()==0);
  s.start();
  for(uint32_t i=1;i<=5;++i) {
    Record r{};r.frameSequence=i;r.wholeFrameCycles=100*i;r.wallElapsedUs=20*i;
    assert(s.nextFrameSequence()==i);assert(s.append(r));
  }
  assert(s.count()==3 && s.overflowCount()==2 && s.outlierCount()==5);
  assert(s.chronological(0).frameSequence==3 && s.chronological(2).frameSequence==5);
  assert(s.worstValid() && s.worst().frameSequence==5 && s.worst().wholeFrameCycles==500);
  s.stop();Record ignored{};ignored.wholeFrameCycles=9999;assert(!s.append(ignored));
  assert(s.worst().frameSequence==5 && s.count()==3);

  ReferenceStore<4> refs;refs.clear();
  for(uint32_t i=0;i<6;i++){Record r{};r.frameSequence=i*256;r.wholeFrameCycles=1000+i;refs.append(r);}
  assert(refs.count()==4 && refs.total()==6 && refs.overflow()==2);
  assert(refs.chronological(0).frameSequence==512);
  assert(refs.chronological(3).frameSequence==1280);
  printf("PASS R7-derived fixed retention: record=%lu store16=%lu refs4=%lu arraysPlusWorking=%lu\n",
    (unsigned long)sizeof(Record),(unsigned long)sizeof(Store<16>),
    (unsigned long)sizeof(ReferenceStore<4>),
    (unsigned long)(sizeof(Store<16>)+sizeof(ReferenceStore<4>)+sizeof(Record)));
}
