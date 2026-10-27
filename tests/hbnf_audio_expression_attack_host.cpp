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

  // Verify a mid-band step does not leak into the bass or treble envelopes.
  hbnf::AudioExpressionSignals isolated{};
  hbnf::AudioExpression midOnly;
  hbnf::VibeMetrics baseline{};
  baseline.silent = false;
  baseline.bassAtt = baseline.midAtt = baseline.trebleAtt = 0.62f;
  midOnly.update(baseline, 0.02f);
  input.midAtt = 1.40f;
  for (int frame = 0; frame < 20; ++frame) isolated = midOnly.update(input, 0.02f);
  assert(isolated.midEnergy > 0.0f);
  assert(isolated.lowEnergy == 0.0f && isolated.highEnergy == 0.0f);

  // The implementation clamps dt to 5–100 ms; equivalent clamped samples match.
  hbnf::AudioExpression shortDt;
  hbnf::AudioExpression minDt;
  hbnf::VibeMetrics stepped = baseline;
  stepped.midAtt = 1.40f;
  shortDt.update(baseline, 0.02f);
  minDt.update(baseline, 0.02f);
  hbnf::AudioExpressionSignals shortSignal = shortDt.update(stepped, 0.001f);
  hbnf::AudioExpressionSignals minSignal = minDt.update(stepped, 0.005f);
  assert(shortSignal.midEnergy == minSignal.midEnergy);
  hbnf::AudioExpression longDt;
  hbnf::AudioExpression maxDt;
  longDt.update(baseline, 0.02f);
  maxDt.update(baseline, 0.02f);
  hbnf::AudioExpressionSignals longSignal = longDt.update(stepped, 0.200f);
  hbnf::AudioExpressionSignals maxSignal = maxDt.update(stepped, 0.100f);
  assert(longSignal.midEnergy == maxSignal.midEnergy);

  // Silence remains authoritative and drains the band envelopes.
  input.silent = true;
  signal = expression.update(input, 0.02f);
  assert(signal.lowEnergy == 0.0f && signal.midEnergy < 0.15f && signal.highEnergy == 0.0f);
}
