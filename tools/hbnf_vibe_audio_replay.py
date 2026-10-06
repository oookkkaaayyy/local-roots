#!/usr/bin/env python3
"""Host-only pre-freeze replay model for HBNF Cart 2.0 Vibe/audio work.

No hardware/network I/O. Numeric formulas remain candidate-only until P2 interface freeze.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path

FEATURE_NAMES = (
    "energy_short","energy_medium","energy_slow","low_pressure","low_transient",
    "mid_body","mid_change","high_detail","high_transient","spectral_brightness",
    "spectral_change","activity","silence_confidence",
)

def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))

def ema_alpha(dt: float, tau: float) -> float:
    dt = max(0.001, min(0.25, float(dt)))
    return 1.0 - math.exp(-dt / tau)

class AudioFeaturesCandidate:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.energy_short = self.energy_medium = self.energy_slow = 0.0
        self.band_fast = [0.0, 0.0, 0.0]
        self.band_medium = [0.0, 0.0, 0.0]
        self.previous_spectrum = [0.0] * 16
        self.mid_change_state = self.spectral_change_state = 0.0
        self.initialized = False

    def update(self, fft: list[int], volume_smth: float, sample_peak: bool, dt: float) -> dict[str, float]:
        if len(fft) != 16:
            raise ValueError("exactly 16 FFT bins are required")
        spectrum = [clamp01(value / 255.0) for value in fft]
        bands = [sum(spectrum[0:4]) / 4.0, sum(spectrum[4:11]) / 7.0, sum(spectrum[11:16]) / 5.0]
        volume = clamp01(volume_smth / 255.0)
        raw_energy = clamp01(0.35*bands[0] + 0.35*bands[1] + 0.20*bands[2] + 0.10*volume)

        if not self.initialized:
            self.energy_short = self.energy_medium = self.energy_slow = raw_energy
            self.band_fast = bands[:]
            self.band_medium = bands[:]
            self.previous_spectrum = spectrum[:]
            self.initialized = True
        else:
            for name, tau in (("energy_short",0.08),("energy_medium",0.45),("energy_slow",2.5)):
                old = getattr(self, name)
                setattr(self, name, old + ema_alpha(dt, tau) * (raw_energy - old))
            for index, band in enumerate(bands):
                self.band_fast[index] += ema_alpha(dt, 0.09) * (band - self.band_fast[index])
                self.band_medium[index] += ema_alpha(dt, 0.55) * (band - self.band_medium[index])

        low_pressure = clamp01(0.68*self.band_medium[0] + 0.32*self.band_fast[0])
        low_transient = clamp01(max(0.0, self.band_fast[0]-self.band_medium[0])*4.0 +
                                (0.12 if sample_peak and bands[0] >= max(bands[1],bands[2]) else 0.0))
        mid_body = clamp01(0.70*self.band_medium[1] + 0.30*self.band_fast[1])
        raw_mid_change = abs(self.band_fast[1]-self.band_medium[1])
        self.mid_change_state += ema_alpha(dt, 0.18) * (raw_mid_change-self.mid_change_state)
        mid_change = clamp01(self.mid_change_state*5.0)
        high_detail = clamp01(0.55*self.band_fast[2] + 0.45*bands[2])
        high_transient = clamp01(max(0.0, self.band_fast[2]-self.band_medium[2])*4.5 +
                                 (0.12 if sample_peak and bands[2] >= max(bands[0],bands[1]) else 0.0))

        total = sum(spectrum)
        spectral_brightness = 0.0 if total < 1e-9 else clamp01(
            sum(index*spectrum[index] for index in range(16)) / (15.0*total)
        )
        raw_change = sum(abs(spectrum[index]-self.previous_spectrum[index]) for index in range(16)) / 16.0
        self.spectral_change_state += ema_alpha(dt,0.12) * (raw_change-self.spectral_change_state)
        spectral_change = clamp01(self.spectral_change_state*3.0)
        activity = clamp01(max(self.energy_short*1.6, low_transient, mid_change, high_transient, spectral_change))
        presence = max(volume, sum(spectrum)/16.0)
        silence_confidence = clamp01(1.0-presence*10.0)
        self.previous_spectrum = spectrum[:]

        values = (
            clamp01(self.energy_short),clamp01(self.energy_medium),clamp01(self.energy_slow),
            low_pressure,low_transient,mid_body,mid_change,high_detail,high_transient,
            spectral_brightness,spectral_change,activity,silence_confidence,
        )
        return dict(zip(FEATURE_NAMES, values))

def vibe_response(features: dict[str,float], grammar: dict) -> dict[str,float]:
    response = {}
    for axis, spec in grammar.items():
        value = float(spec.get("base",0.0))
        for feature, weight in spec.items():
            if feature != "base":
                value += float(features[feature]) * float(weight)
        response[axis] = clamp01(value)
    return response

def response_distance(left: dict[str,float], right: dict[str,float], axes: list[str]) -> float:
    return sum(abs(left[axis]-right[axis]) for axis in axes) / len(axes)

class AutoSelectorCandidate:
    """Long-dwell/hysteretic characteristic scorer; explicitly not genre recognition."""
    def __init__(self, minimum_dwell_seconds: float=45.0, switch_margin: float=0.12) -> None:
        self.minimum_dwell_seconds = minimum_dwell_seconds
        self.switch_margin = switch_margin
        self.current = "CHILL"
        self.elapsed = 0.0

    @staticmethod
    def scores(features: dict[str,float]) -> dict[str,float]:
        return {
            "CHILL": clamp01(0.55*features["silence_confidence"] + 0.30*(1.0-features["activity"]) + 0.15*features["energy_slow"]),
            "GROOVE": clamp01(0.45*features["mid_change"] + 0.35*features["low_transient"] + 0.20*features["activity"]),
            "HEAVY": clamp01(0.50*features["low_pressure"] + 0.35*features["low_transient"] + 0.15*features["energy_medium"]),
            "PSYCHEDELIC": clamp01(0.45*features["spectral_change"] + 0.30*features["mid_change"] + 0.25*features["spectral_brightness"]),
            "COSMIC": clamp01(0.40*features["energy_slow"] + 0.30*features["high_detail"] + 0.30*(1.0-features["activity"])),
        }

    def update(self, features: dict[str,float], dt: float) -> str:
        self.elapsed += max(0.0,float(dt))
        scores = self.scores(features)
        challenger = max(scores,key=scores.get)
        if challenger != self.current and self.elapsed >= self.minimum_dwell_seconds:
            if scores[challenger] >= scores[self.current] + self.switch_margin:
                self.current = challenger
                self.elapsed = 0.0
        return self.current

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config",type=Path,required=True)
    parser.add_argument("--trace",type=Path,required=True,help="JSONL: fft, volumeSmth, samplePeak, dt")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    extractor = AudioFeaturesCandidate()
    for raw in args.trace.read_text(encoding="utf-8").splitlines():
        sample = json.loads(raw)
        features = extractor.update(sample["fft"],sample.get("volumeSmth",0.0),
                                    bool(sample.get("samplePeak",False)),float(sample.get("dt",0.02)))
        print(json.dumps({"features":features,"vibes":{
            name:vibe_response(features,grammar) for name,grammar in config["vibes"].items()
        }},sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
