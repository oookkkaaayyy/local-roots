#pragma once

#include <stdint.h>

namespace hbnf_brightness {

// Called only at final Matrix output. The scene renderer, animation clock,
// kernel selection, motion and audio continue to operate on canonical RGB.
inline uint8_t outputScale(uint8_t brightness) { return brightness; }

inline uint8_t scaleChannel(uint8_t value, uint8_t scale) {
  if (!value || !scale) return 0;
  // Round upward so a nonzero canonical channel is not quantized away by a
  // low, nonzero night setting.
  return (uint8_t)(((uint16_t)value * scale + 254u) / 255u);
}

template <typename Rgb>
inline Rgb scaleOutputPixel(const Rgb& gammaCorrected,
                            const Rgb& canonical,
                            uint8_t scale) {
  if (!scale) return Rgb(0, 0, 0);
  Rgb out(scaleChannel(gammaCorrected.r, scale),
          scaleChannel(gammaCorrected.g, scale),
          scaleChannel(gammaCorrected.b, scale));
  if (!(out.r || out.g || out.b) && (canonical.r || canonical.g || canonical.b)) {
    if (canonical.r >= canonical.g && canonical.r >= canonical.b) out.r = 1;
    else if (canonical.g >= canonical.b) out.g = 1;
    else out.b = 1;
  }
  return out;
}

}  // namespace hbnf_brightness
