#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <numeric>
#include <sstream>
#include <string>
#include <vector>

#include "../firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_vibe16.h"
#include "../firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_audio_expression.h"

struct ReplayRow {
  float candidate;
  float baseline;
  bool midDominant;
};

int main() {
  hbnf::Vibe16 vibe;
  hbnf::AudioExpression expression;
  std::vector<ReplayRow> rows;
  std::string line;
  size_t lineNumber = 0;
  while (std::getline(std::cin, line)) {
    ++lineNumber;
    std::istringstream input(line);
    uint8_t fft[16]{};
    int bin = 0;
    for (; bin < 16; ++bin) {
      int value = 0;
      if (!(input >> value) || value < 0 || value > 255) {
        std::cerr << "invalid FFT bin at row " << lineNumber << "\n";
        return 2;
      }
      fft[bin] = static_cast<uint8_t>(value);
    }
    double volumeInput = 0.0;
    float dt = 0.0f;
    if (!(input >> volumeInput >> dt) || !std::isfinite(volumeInput) || !std::isfinite(dt)) {
      std::cerr << "invalid volume/dt at row " << lineNumber << "\n";
      return 2;
    }
    const float volume = static_cast<float>(volumeInput);

    const hbnf::VibeMetrics metrics = vibe.update(fft, volume, dt);
    const float target = metrics.silent ? 0.0f :
        std::max(0.0f, std::min(1.0f, (metrics.midAtt - 0.62f) / 0.78f));
    static bool baselineInitialized = false;
    static float baselineMid = 0.0f;
    if (!baselineInitialized) {
      baselineMid = target;
      baselineInitialized = true;
    } else {
      const float tau = target > baselineMid ? 0.115f : 0.62f;
      baselineMid += (1.0f - std::exp(-dt / tau)) * (target - baselineMid);
      if (metrics.silent) baselineMid += (1.0f - std::exp(-dt / 0.48f)) * (0.0f - baselineMid);
    }

    const hbnf::AudioExpressionSignals result = expression.update(metrics, dt);
    const float bass = (fft[0] + fft[1] + fft[2] + fft[3]) / 4.0f;
    const float mid = (fft[4] + fft[5] + fft[6] + fft[7] + fft[8] + fft[9] + fft[10]) / 7.0f;
    const float high = (fft[11] + fft[12] + fft[13] + fft[14] + fft[15]) / 5.0f;
    rows.push_back({result.midEnergy, baselineMid, mid > bass && mid > high && mid > 0.0f});
  }
  if (rows.empty()) return 3;

  std::vector<float> absoluteDelta, candidateAtMid, baselineAtMid;
  double meanDelta = 0.0;
  for (const ReplayRow& row : rows) {
    const float delta = row.candidate - row.baseline;
    meanDelta += delta;
    absoluteDelta.push_back(std::fabs(delta));
    if (row.midDominant) {
      candidateAtMid.push_back(row.candidate);
      baselineAtMid.push_back(row.baseline);
    }
  }
  std::sort(absoluteDelta.begin(), absoluteDelta.end());
  const float p95 = absoluteDelta[static_cast<size_t>(0.95 * (absoluteDelta.size() - 1))];
  std::printf("samples=%zu\nmid_dominant_samples=%zu\nmean_signed_delta=%.6f\np95_absolute_delta=%.6f\nmax_absolute_delta=%.6f\n",
              rows.size(), candidateAtMid.size(), meanDelta / rows.size(), p95, absoluteDelta.back());
  if (!candidateAtMid.empty()) {
    const double candidateMean = std::accumulate(candidateAtMid.begin(), candidateAtMid.end(), 0.0) / candidateAtMid.size();
    const double baselineMean = std::accumulate(baselineAtMid.begin(), baselineAtMid.end(), 0.0) / baselineAtMid.size();
    std::printf("mid_dominant_candidate_mean=%.6f\nmid_dominant_baseline_mean=%.6f\n",
                candidateMean, baselineMean);
  }
}
