#pragma once

#include <stddef.h>
#include <stdint.h>

namespace hbnf_r6_outlier_trace {

static inline bool exceeds(uint32_t wholeFrameCycles, uint32_t thresholdCycles) {
  return wholeFrameCycles > thresholdCycles;
}

// ArduinoJson's pinned WLED build disables long-long serialization. Preserve
// the full monotonic microsecond timestamp as two exact supported uint32s.
static inline uint32_t timestampHigh(uint64_t value) {
  return static_cast<uint32_t>(value >> 32);
}

static inline uint32_t timestampLow(uint64_t value) {
  return static_cast<uint32_t>(value);
}

static inline uint64_t timestampFromParts(uint32_t high, uint32_t low) {
  return (static_cast<uint64_t>(high) << 32) | static_cast<uint64_t>(low);
}

// One record is copied only after an individual frame exceeds the frozen
// diagnostic capture threshold. CCOUNT fields are elapsed core cycles and may
// include preemption; they are not per-task CPU-time measurements.
struct Record {
  uint64_t monotonicUs=0;
  uint32_t wallElapsedUs=0;
  uintptr_t taskHandle=0;
  uint32_t freeHeap=0;
  uint16_t cpuMhzStart=0,cpuMhzEnd=0;
  int8_t coreStart=-1,coreEnd=-1;
  uint8_t scene=0,vibe=0,motion=0,matrixBrightness=0,auxBrightness=0,audioResponse=0;
  uint8_t matrixWidth=0,matrixHeight=0,audioSourcePresent=0,paletteMode=0,paletteIndex=0,variantMix=0;
  struct Variant {
    uint32_t signature=0;
    uint16_t salt=0,dwellSeconds=0;
    uint8_t kernel=0,family=0,palette=0,speed=0,profile=0,style=0,amount=0;
    int8_t hueOffset=0;
    uint8_t transform=0,warp=0;
  } current,previous;
  uint8_t audioFrame[17]{};
  uint8_t audioFeatures[13]{};
  uint8_t fft[16]{};
  uint32_t vibeAudioInputFloatBits[13]{};
  uint8_t vibeAudioInputSilent=1;
  uint8_t vibeAxes[9]{};
  uint32_t volumeFloatBits=0;
  uint32_t frameSequence=0;
  uint32_t frame=0;
  uint32_t frameStartCycles=0;
  uint32_t frameEndCycles=0;
  uint32_t wholeFrameCycles=0;
  uint32_t kernelGrossCycles=0;
  uint32_t audioCycles=0;
  uint32_t audioInKernelCycles=0;
  uint32_t colorCycles=0;
  uint32_t colorInKernelCycles=0;
  uint32_t schedulerCycles=0;
  uint32_t overlayCycles=0;
  uint32_t companionPrepCycles=0;
  uint32_t ddpSendCycles=0;
  uint32_t unaccountedCycles=0;
  uint32_t variantSignature=0;
  // Cost through the fixed record append, excluding the final accounting
  // field store and the enclosing critical-section exit. The matched window
  // comparison measures total observer effect.
  uint32_t traceCaptureBodyCycles=0;
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
    started_=true;
    armed_=true;
  }

  void stop() { armed_=false; }
  bool resume() {
    if (!started_) return false;
    armed_=true;
    return true;
  }
  bool armed() const { return armed_; }
  bool started() const { return started_; }
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

  void setLastCaptureBodyCycles(uint32_t cycles) {
    if (!count_) return;
    records_[lastIndex_].traceCaptureBodyCycles=cycles;
    if (worstValid_ && worst_.frameSequence==records_[lastIndex_].frameSequence)
      worst_.traceCaptureBodyCycles=cycles;
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
  bool started_=false;
  bool worstValid_=false;
};

// Deterministic low-rate normal-frame references share the same payload shape
// as outliers but are kept separately, so they never affect worst-frame logic.
template <size_t Capacity>
class ReferenceStore {
 public:
  static_assert(Capacity > 0, "reference capacity must be nonzero");
  void clear() { count_=next_=total_=overflow_=0; }
  void append(const Record& record) {
    records_[next_]=record;
    next_=(next_+1u)%Capacity;
    if(count_<Capacity)++count_;else if(overflow_!=UINT32_MAX)++overflow_;
    if(total_!=UINT32_MAX)++total_;
  }
  size_t count() const { return count_; }
  uint32_t total() const { return total_; }
  uint32_t overflow() const { return overflow_; }
  const Record& chronological(size_t index) const {
    const size_t first=count_==Capacity?next_:0u;
    return records_[(first+index)%Capacity];
  }
  void setLastCaptureBodyCycles(uint32_t cycles) {
    if(!count_)return;
    const size_t last=(next_+Capacity-1u)%Capacity;
    records_[last].traceCaptureBodyCycles=cycles;
  }
 private:
  Record records_[Capacity]{};
  size_t count_=0,next_=0;
  uint32_t total_=0,overflow_=0;
};

}  // namespace hbnf_r6_outlier_trace
