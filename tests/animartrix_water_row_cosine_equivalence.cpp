#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstring>

static constexpr float PI = 3.14159265358979323846f;
static constexpr int WIDTH = 32;
static constexpr int HEIGHT = 16;

static uint32_t next(uint32_t& state) {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return state;
}

int main() {
  uint32_t random = 0x7a31c5e9u;
  for (int sample = 0; sample < 10000; ++sample) {
    const float directionX = (float(int32_t(next(random))) / 2147483648.0f) * 2.0f;
    const float directionY = (float(int32_t(next(random))) / 2147483648.0f) * 2.0f;
    float rowCosine[HEIGHT];
    for (int y = 0; y < HEIGHT; ++y)
      rowCosine[y] = 4 * cosf(directionY * PI + float(y) / 2);

    for (int x = 0; x < WIDTH; ++x) {
      for (int y = 0; y < HEIGHT; ++y) {
        const float distance = float(int32_t(next(random)) % 100000) / 1000.0f;
        const float original = distance + 4 * sinf(directionX * PI + float(x) / 2)
            + 4 * cosf(directionY * PI + float(y) / 2);
        const float hoisted = distance + 4 * sinf(directionX * PI + float(x) / 2)
            + rowCosine[y];
        assert(std::memcmp(&original, &hoisted, sizeof(original)) == 0);
      }
    }
  }
}
