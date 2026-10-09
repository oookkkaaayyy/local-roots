#pragma once

#include <stddef.h>
#include <stdint.h>

namespace hbnf_outlier_trace {

static inline bool exceeds(uint32_t wholeFrameCycles, uint32_t thresholdCycles) {
  return wholeFrameCycles > thresholdCycles;
}

// One record is copied only after an individual frame exceeds the frozen
// diagnostic capture threshold. All durations are raw CPU cycles.
struct Record {
  uint64_t monotonicUs=0;
  uint32_t frameSequence=0;
  uint32_t frameStartCycles=0;
  uint32_t frameEndCycles=0;
  uint32_t wholeFrameCycles=0;
  uint32_t kernelGrossCycles=0;
  uint32_t audioCycles=0;
  uint32_t colorCycles=0;
  uint32_t schedulerCycles=0;
  uint32_t overlayCycles=0;
  uint32_t companionPrepCycles=0;
  uint32_t ddpSendCycles=0;
  uint32_t unaccountedCycles=0;
  uint32_t variantSignature=0;
  uint32_t traceWriteCycles=0;
  uint8_t kernelId=255;
};

template <size_t Capacity>
class Store {
 public:
  static_assert(Capacity > 0, "trace capacity must be nonzero");

  void start() {
    armed_=false;
    count_=0;
    next_=0;
    overflowCount_=0;
    outlierCount_=0;
    worstValid_=false;
    frameSequence_=0;
    armed_=true;
  }

  void stop() { armed_=false; }
  bool armed() const { return armed_; }
  uint32_t nextFrameSequence() { return armed_ ? ++frameSequence_ : 0; }
  uint32_t count() const { return count_; }
  uint32_t overflowCount() const { return overflowCount_; }
  uint32_t outlierCount() const { return outlierCount_; }
  bool worstValid() const { return worstValid_; }
  const Record& worst() const { return worst_; }

  // The ring preserves the latest Capacity outliers. The separate worst
  // record guarantees the largest observed frame survives any ring wrap.
  // `stop()` must precede readback so records are immutable while serialized.
  bool append(const Record& record) {
    if (!armed_) return false;
    if (outlierCount_ != UINT32_MAX) ++outlierCount_;
    records_[next_]=record;
    if (count_ < Capacity) {
      ++count_;
    } else if (overflowCount_ != UINT32_MAX) {
      ++overflowCount_;
    }
    next_=(next_+1u)%Capacity;
    lastIndex_=(next_+Capacity-1u)%Capacity;
    if (!worstValid_ || record.wholeFrameCycles>worst_.wholeFrameCycles) {
      worst_=record;
      worstValid_=true;
    }
    return true;
  }

  void setLastWriteCycles(uint32_t cycles) {
    if (!count_) return;
    records_[lastIndex_].traceWriteCycles=cycles;
    if (worstValid_ && worst_.frameSequence==records_[lastIndex_].frameSequence)
      worst_.traceWriteCycles=cycles;
  }

  // Chronological order, oldest retained entry first.
  const Record& chronological(size_t index) const {
    const size_t first=(count_==Capacity)?next_:0u;
    return records_[(first+index)%Capacity];
  }

 private:
  Record records_[Capacity]{};
  Record worst_{};
  uint32_t frameSequence_=0;
  uint32_t overflowCount_=0;
  uint32_t outlierCount_=0;
  uint32_t count_=0;
  size_t next_=0;
  size_t lastIndex_=0;
  bool armed_=false;
  bool worstValid_=false;
};

}  // namespace hbnf_outlier_trace
