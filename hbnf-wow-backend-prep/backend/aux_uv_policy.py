"""Device-independent UV control policy; emits native WLED JSON state patches."""
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

class Mode(str, Enum):
    OFF = "OFF"
    MANUAL = "MANUAL"
    FOLLOW_MATRIX = "FOLLOW_MATRIX"
    VIBE_REACTIVE = "VIBE_REACTIVE"

@dataclass(frozen=True)
class UVConfig:
    segment_ids: tuple[int, ...]
    max_brightness: int = 0  # 0 until owner/commissioning sets a reviewed cap
    ramp_per_tick: int = 4
    enabled: bool = False
    hardware_available: bool = False

    def __post_init__(self) -> None:
        if not 0 <= self.max_brightness <= 255:
            raise ValueError("max_brightness must be 0..255")
        if self.ramp_per_tick < 1:
            raise ValueError("ramp_per_tick must be positive")

@dataclass(frozen=True)
class UVState:
    mode: Mode = Mode.OFF
    manual_brightness: int = 0
    owner_override: Optional[int] = None
    current_output: int = 0

def clamp(value: int, maximum: int) -> int:
    return max(0, min(maximum, int(value)))

def next_output(state: UVState, config: UVConfig, *, matrix_brightness: int = 0,
                vibe_envelope: int = 0) -> int:
    if not config.enabled or not config.hardware_available or state.mode == Mode.OFF:
        return 0  # safety OFF is immediate; ordinary setpoint changes are ramped below
    elif state.owner_override is not None:
        target = clamp(state.owner_override, config.max_brightness)
    elif state.mode == Mode.MANUAL:
        target = clamp(state.manual_brightness, config.max_brightness)
    elif state.mode == Mode.FOLLOW_MATRIX:
        target = round(clamp(matrix_brightness, 255) * config.max_brightness / 255)
    else:
        target = round(clamp(vibe_envelope, 255) * config.max_brightness / 255)
    step = max(1, config.ramp_per_tick)
    return min(target, state.current_output + step) if target > state.current_output else max(target, state.current_output - step)

def wled_state_patch(config: UVConfig, brightness: int) -> dict[str, Any]:
    """Use WLED's JSON state API per-segment brightness; no protocol invented."""
    level = clamp(brightness, config.max_brightness) if config.enabled and config.hardware_available else 0
    return {"on": True, "seg": [{"id": sid, "on": level > 0, "bri": level} for sid in config.segment_ids]}
