#pragma once

#include <stddef.h>
#include <stdint.h>

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

} // namespace hbnf_u64_format
