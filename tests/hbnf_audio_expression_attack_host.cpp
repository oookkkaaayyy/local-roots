#include <cassert>
#include <cstdio>
#include "../firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_audio_expression.h"

int main() {
  hbnf::AudioExpression expression;
  hbnf::VibeMetrics input{};
  input.silent = false;
  input.bassAtt = input.midAtt = input.trebleAtt = 0.62f;
  expression.update(input, 0.02f);

  input.midAtt = 1.40f;
  hbnf::AudioExpressionSignals signal{};
  for (int frame = 0; frame < 5; ++frame) signal = expression.update(input, 0.02f);

  std::printf("mid_energy_at_100ms=%.6f low=%.6f high=%.6f\n",
              signal.midEnergy, signal.lowEnergy, signal.highEnergy);
  assert(signal.midEnergy >= 0.63f);
  assert(signal.lowEnergy == 0.0f && signal.highEnergy == 0.0f);

  input.midAtt = 0.62f;
  for (int frame = 0; frame < 50; ++frame) signal = expression.update(input, 0.02f);
  std::printf("mid_energy_after_1000ms_release=%.6f\n", signal.midEnergy);
  assert(signal.midEnergy > 0.12f && signal.midEnergy < 0.15f);
  assert(signal.lowEnergy == 0.0f && signal.highEnergy == 0.0f);
}
