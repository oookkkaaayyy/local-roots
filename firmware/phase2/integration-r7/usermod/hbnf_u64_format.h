#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

namespace hbnf_u64_format {

// Newlib nano on the pinned ESP32 target does not support %llu. Keep the
// uint64 decimal conversion small and call it only during trace readback.
inline bool decimal(uint64_t value, char* output, size_t capacity) {
  if (output == nullptr || capacity == 0) return false;
  char reversed[20];
  size_t digits = 0;
  do {
    reversed[digits++] = static_cast<char>('0' + (value % 10));
    value /= 10;
  } while (value != 0 && digits < sizeof(reversed));
  if (digits + 1 > capacity) {
    output[0] = '\0';
    return false;
  }
  for (size_t i = 0; i < digits; ++i) output[i] = reversed[digits - i - 1];
  output[digits] = '\0';
  return true;
}

inline bool formatTraceRecord(uint64_t monotonicUs,
                              uint32_t frameSequence,
                              uint32_t frameStartCycles,
                              uint32_t frameEndCycles,
                              uint32_t wholeFrameCycles,
                              uint32_t kernelGrossCycles,
                              uint32_t audioCycles,
                              uint32_t colorCycles,
                              uint32_t schedulerCycles,
                              uint32_t overlayCycles,
                              uint32_t companionPrepCycles,
                              uint32_t ddpSendCycles,
                              uint32_t unaccountedCycles,
                              uint32_t variantSignature,
                              uint32_t traceCaptureBodyCycles,
                              uint8_t kernelId,
                              char* output,
                              size_t capacity) {
  if (output == nullptr || capacity == 0) return false;
  char timestamp[21];
  if (!decimal(monotonicUs, timestamp, sizeof(timestamp))) {
    output[0] = '\0';
    return false;
  }
  const int written = snprintf(output, capacity,
      "%s,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%u",
      timestamp,
      static_cast<unsigned long>(frameSequence),
      static_cast<unsigned long>(frameStartCycles),
      static_cast<unsigned long>(frameEndCycles),
      static_cast<unsigned long>(wholeFrameCycles),
      static_cast<unsigned long>(kernelGrossCycles),
      static_cast<unsigned long>(audioCycles),
      static_cast<unsigned long>(colorCycles),
      static_cast<unsigned long>(schedulerCycles),
      static_cast<unsigned long>(overlayCycles),
      static_cast<unsigned long>(companionPrepCycles),
      static_cast<unsigned long>(ddpSendCycles),
      static_cast<unsigned long>(unaccountedCycles),
      static_cast<unsigned long>(variantSignature),
      static_cast<unsigned long>(traceCaptureBodyCycles),
      static_cast<unsigned>(kernelId));
  if (written < 0 || static_cast<size_t>(written) >= capacity) {
    output[0] = '\0';
    return false;
  }
  return true;
}

} // namespace hbnf_u64_format
