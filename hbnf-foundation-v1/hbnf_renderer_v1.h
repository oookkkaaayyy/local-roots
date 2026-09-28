#pragma once
#include <stdint.h>
#include <stddef.h>
#include "hbnf_foundation_v1.h"

namespace hbnf_v1 {

static constexpr uint16_t MATRIX_W = 32;
static constexpr uint16_t MATRIX_H = 16;
static constexpr uint16_t MATRIX_PIXELS = MATRIX_W * MATRIX_H;
static constexpr uint16_t COMPANION_PIXELS = 22;

struct RenderPixel {
  uint8_t paletteIndex = 0;
  uint8_t level = 0;
};

struct RenderFrame {
  uint32_t audioSequence = 0;
  uint32_t timestampMs = 0;
  RenderPixel matrix[MATRIX_PIXELS];
  RenderPixel companion[COMPANION_PIXELS];
};

inline uint16_t matrixIndex(uint16_t x, uint16_t y) {
  return (uint16_t)(y * MATRIX_W + x);
}

// Evidence basis: WLED 16.0.1 FX_MODE_2DGEQ.
// - FFT band magnitude maps directly to vertical height.
// - band identity maps to palette position.
// HBNF adaptation:
// - explicit ControlState mappings
// - same AudioFrame feeds Matrix + Companion
// - companion is rendered directly, never sampled from the Matrix framebuffer.
class SpectrumRendererV1 {
 public:
  static RenderFrame render(const AudioFrame& audio, const ControlState& controls) {
    const RenderControls mapped = mapControls(controls);
    RenderFrame out;
    out.audioSequence = audio.sequence;
    out.timestampMs = audio.timestampMs;

    const uint8_t phase = phaseFromTime(audio.timestampMs, mapped.motionQ8);
    const uint16_t spread = mapped.variationQ8; // 0..256

    // WLED 2D GEQ principle: matrix X maps to FFT band, band value to bar height.
    for (uint16_t x=0; x<MATRIX_W; ++x) {
      const uint8_t band = (uint8_t)(((uint32_t)x * 16u) / MATRIX_W);
      const uint8_t audioLevel = modulatedBand(audio.bins[band], mapped.audioDepthQ8);
      const uint8_t finalLevel = scale8(audioLevel, mapped.matrixScaleQ8);
      const uint16_t height = (uint16_t)(((uint32_t)audioLevel * MATRIX_H + 254u) / 255u);
      const uint8_t colorIndex = paletteForBand(band, phase, spread);

      for (uint16_t y=0; y<MATRIX_H; ++y) {
        RenderPixel& px = out.matrix[matrixIndex(x,y)];
        const bool lit = y >= (MATRIX_H - height);
        px.paletteIndex = colorIndex;
        px.level = lit ? finalLevel : 0;
      }
    }

    // The 22-pixel fixture expresses the same spectral frame directly.
    // Every companion pixel maps to a WLED FFT band and uses the exact same
    // phase, palette spread, audio depth and AudioFrame sequence.
    for (uint16_t i=0; i<COMPANION_PIXELS; ++i) {
      const uint8_t band = (uint8_t)(((uint32_t)i * 16u) / COMPANION_PIXELS);
      const uint8_t audioLevel = modulatedBand(audio.bins[band], mapped.audioDepthQ8);
      out.companion[i].paletteIndex = paletteForBand(band, phase, spread);
      out.companion[i].level = scale8(audioLevel, mapped.auxScaleQ8);
    }

    return out;
  }

 private:
  static uint8_t phaseFromTime(uint32_t ms, uint16_t motionQ8) {
    // Motion maps only to palette/phase velocity. Zero is stationary.
    // At 100%, palette phase traverses ~256 units per 4 seconds.
    const uint64_t scaled = (uint64_t)ms * motionQ8;
    return (uint8_t)((scaled / 4000u) & 0xFFu);
  }

  static uint8_t paletteForBand(uint8_t band, uint8_t phase, uint16_t variationQ8) {
    // Variation controls spectral color separation only in this family:
    // 0 = coherent single palette position; 100 = full 16-band spread.
    const uint16_t fullSpread = (uint16_t)band * 17u;
    const uint8_t offset = (uint8_t)((fullSpread * variationQ8 + 128u) >> 8);
    return (uint8_t)(phase + offset);
  }
};

} // namespace hbnf_v1
