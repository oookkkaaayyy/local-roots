#pragma once

// HBNF R2 perceptually-legible 3-band Vibe adapter for WLED AudioReactive
// fftResult[16]. R1 proved the audio path physically, but a busy ANIMartRIX
// effect could read as generic jitter. R2 therefore derives a musically
// legible transient envelope: near-idle between events, smooth flow surges on
// bass/mid/treble onsets, bounded decay, and no second FFT/audio capture.

#include <math.h>
#include <stdint.h>

namespace hbnf {

struct VibeMetrics {
  float bass = 1.0f;
  float mid = 1.0f;
  float treble = 1.0f;
  float overall = 1.0f;
  float bassAtt = 1.0f;
  float midAtt = 1.0f;
  float trebleAtt = 1.0f;
  bool bassSpike = false;
  bool midSpike = false;
  bool trebleSpike = false;
  bool silent = false;
  float transient = 0.0f;
  float pulse = 0.0f;
  float speedFactor = 1.0f;
};

class Vibe16 {
 public:
  Vibe16() { reset(); }

  void reset() {
    for (int i = 0; i < 3; ++i) {
      avg_[i] = 0.0f;
      long_[i] = 0.0f;
      rel_[i] = 1.0f;
      att_[i] = 1.0f;
      silence_[i] = 1.0f;
      prevSpike_[i] = false;
      spike_[i] = false;
    }
    frame_ = 0;
    speed_ = 1.0f;
    pulse_ = 0.0f;
    refractory_ = 0.0f;
    hold_ = 0.0f;
  }

  VibeMetrics update(const uint8_t fft[16], float volume, float dtSeconds) {
    const float dt = clampf(dtSeconds, 0.005f, 0.100f);
    float imm[3] = {
      meanBins(fft, 0, 4),
      meanBins(fft, 4, 11),
      meanBins(fft, 11, 16)
    };

    ++frame_;
    if (frame_ == 1) {
      for (int i = 0; i < 3; ++i) {
        avg_[i] = imm[i];
        long_[i] = imm[i];
      }
    } else {
      const float fps = 1.0f / dt;
      const float attack = adjustedRate(0.2f, fps);
      const float decay = adjustedRate(0.5f, fps);
      const float longRate = adjustedRate(0.992f, fps);
      for (int i = 0; i < 3; ++i) {
        const float r = (imm[i] > avg_[i]) ? attack : decay;
        avg_[i] = avg_[i] * r + imm[i] * (1.0f - r);
        long_[i] = long_[i] * longRate + avg_[i] * (1.0f - longRate);
      }
    }

    float fftSum = 0.0f;
    for (int i = 0; i < 16; ++i) fftSum += fft[i];
    const bool silent = (volume < 1.0f && fftSum < 12.0f);

    float novelty[3] = {0.0f, 0.0f, 0.0f};
    for (int i = 0; i < 3; ++i) {
      const float raw = (long_[i] < 0.001f) ? 1.0f : imm[i] / long_[i];
      const float smoothed = (long_[i] < 0.001f) ? 1.0f : avg_[i] / long_[i];
      if (silent) {
        const float k = expf(-dt / 0.30f);
        silence_[i] *= k;
        rel_[i] = raw * silence_[i];
        att_[i] = smoothed * silence_[i];
      } else {
        silence_[i] = 1.0f;
        rel_[i] = raw;
        att_[i] = smoothed;
      }
      novelty[i] = silent ? 0.0f : clampf(rel_[i] - att_[i], 0.0f, 0.60f);
      prevSpike_[i] = spike_[i];
      spike_[i] = (novelty[i] > 0.030f) && !silent;
    }

    const float transient = clampf(fmaxf(novelty[0] * 9.0f,
                                  fmaxf(novelty[1] * 5.5f,
                                        novelty[2] * 3.8f)),
                                   0.0f, 1.0f);

    // A qualified onset creates one coherent surge rather than following every
    // FFT frame. The hold + fast decay creates obvious musical phrasing while
    // the refractory window suppresses chatter/jitter.
    refractory_ = fmaxf(0.0f, refractory_ - dt);
    hold_ = fmaxf(0.0f, hold_ - dt);
    const bool qualifiedHit = transient > 0.30f && refractory_ <= 0.0f;
    if (qualifiedHit) {
      pulse_ = fmaxf(pulse_, transient);
      hold_ = 0.060f;
      refractory_ = 0.120f;
    } else if (hold_ <= 0.0f) {
      pulse_ *= expf(-dt / 0.090f);
    }
    if (silent) {
      hold_ = 0.0f;
      pulse_ *= expf(-dt / 0.070f);
    }

    // Near-idle between hits is intentional: on a busy effect the user should
    // still perceive "music caused that surge" rather than generic motion.
    const float rest = silent ? 0.10f : 0.12f;
    const float target = clampf(rest + 2.80f * pulse_, 0.10f, 2.95f);
    const float tau = (target > speed_) ? 0.035f : 0.075f;
    const float alpha = 1.0f - expf(-dt / tau);
    speed_ += alpha * (target - speed_);

    const float overall = (rel_[0] + rel_[1] + rel_[2]) / 3.0f;
    VibeMetrics out;
    out.bass = rel_[0]; out.mid = rel_[1]; out.treble = rel_[2]; out.overall = overall;
    out.bassAtt = att_[0]; out.midAtt = att_[1]; out.trebleAtt = att_[2];
    out.bassSpike = spike_[0] && !prevSpike_[0];
    out.midSpike = spike_[1] && !prevSpike_[1];
    out.trebleSpike = spike_[2] && !prevSpike_[2];
    out.silent = silent;
    out.transient = transient;
    out.pulse = pulse_;
    out.speedFactor = speed_;
    return out;
  }

  float speedFactor() const { return speed_; }

 private:
  static float clampf(float x, float lo, float hi) {
    return x < lo ? lo : (x > hi ? hi : x);
  }

  static float adjustedRate(float rateAt30Fps, float actualFps) {
    return powf(powf(rateAt30Fps, 30.0f), 1.0f / actualFps);
  }

  static float meanBins(const uint8_t fft[16], int begin, int end) {
    float sum = 0.0f;
    for (int i = begin; i < end; ++i) sum += fft[i];
    return sum / static_cast<float>(end - begin);
  }

  float avg_[3];
  float long_[3];
  float rel_[3];
  float att_[3];
  float silence_[3];
  bool prevSpike_[3];
  bool spike_[3];
  uint32_t frame_;
  float speed_;
  float pulse_;
  float refractory_;
  float hold_;
};

} // namespace hbnf
