#pragma once
#include <stdint.h>
#include <stddef.h>

namespace hbnf_v1 {

struct ControlState {
  uint8_t matrixBrightness = 100;   // 0..100
  uint8_t auxBrightness = 100;      // 0..100
  uint8_t motion = 50;              // 0..100 normalized renderer intent
  uint8_t audioResponse = 50;       // 0..100 normalized modulation depth
  uint8_t variation = 50;           // 0..100 normalized evolution amount
};

struct AudioFrame {
  uint32_t sequence = 0;
  uint32_t timestampMs = 0;
  uint8_t volume = 0;               // WLED AudioReactive volumeSmth, clamped
  uint8_t bins[16] = {0};           // WLED AudioReactive fftResult, preserved exactly
  uint8_t low = 0;                  // mean fftResult[0..3]
  uint8_t mid = 0;                  // mean fftResult[4..10]
  uint8_t high = 0;                 // mean fftResult[11..15]
  bool peak = false;                // WLED AudioReactive samplePeak
};

struct RenderControls {
  uint16_t matrixScaleQ8 = 256;     // 0..256
  uint16_t auxScaleQ8 = 256;        // 0..256
  uint16_t motionQ8 = 128;          // normalized 0..256
  uint16_t audioDepthQ8 = 128;      // normalized 0..256
  uint16_t variationQ8 = 128;       // normalized 0..256
};

inline uint8_t clamp100(uint8_t v) { return v > 100 ? 100 : v; }
inline uint16_t q8FromPercent(uint8_t v) {
  return (uint16_t)((uint32_t)clamp100(v) * 256u + 50u) / 100u;
}

inline RenderControls mapControls(const ControlState& c) {
  RenderControls out;
  out.matrixScaleQ8 = q8FromPercent(c.matrixBrightness);
  out.auxScaleQ8 = q8FromPercent(c.auxBrightness);
  out.motionQ8 = q8FromPercent(c.motion);
  out.audioDepthQ8 = q8FromPercent(c.audioResponse);
  out.variationQ8 = q8FromPercent(c.variation);
  return out;
}

inline uint8_t meanRange(const uint8_t* fft, size_t begin, size_t end) {
  if (!fft || begin >= end) return 0;
  uint32_t sum = 0;
  for (size_t i = begin; i < end; ++i) sum += fft[i];
  return (uint8_t)((sum + (uint32_t)(end - begin) / 2u) / (uint32_t)(end - begin));
}

inline AudioFrame makeAudioFrame(
  uint32_t sequence,
  uint32_t timestampMs,
  float volumeSmth,
  const uint8_t fftResult[16],
  bool samplePeak
) {
  AudioFrame out;
  out.sequence = sequence;
  out.timestampMs = timestampMs;
  if (volumeSmth <= 0.0f) out.volume = 0;
  else if (volumeSmth >= 255.0f) out.volume = 255;
  else out.volume = (uint8_t)(volumeSmth + 0.5f);
  for (size_t i=0;i<16;i++) out.bins[i]=fftResult?fftResult[i]:0;
  out.low = meanRange(out.bins, 0, 4);
  out.mid = meanRange(out.bins, 4, 11);
  out.high = meanRange(out.bins, 11, 16);
  out.peak = samplePeak;
  return out;
}

inline uint8_t scale8(uint8_t value, uint16_t q8) {
  const uint32_t x = (uint32_t)value * q8 + 128u;
  return (uint8_t)((x >> 8) > 255u ? 255u : (x >> 8));
}

// Audio modulation depth is a pure multiplier on an already-processed WLED
// AudioFrame. It never changes the underlying AudioFrame and never adapts over
// time. This guarantees that identical audio input + control state is identical.
inline uint8_t modulatedBand(uint8_t band, uint16_t audioDepthQ8) {
  return scale8(band, audioDepthQ8);
}

} // namespace hbnf_v1
