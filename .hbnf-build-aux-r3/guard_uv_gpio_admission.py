#!/usr/bin/env python3
"""Reserve Cart UV GPIOs in fail-dark AUX firmware at WLED pin admission."""
from __future__ import annotations

import pathlib


MULTI_ANCHOR = "bool PinManager::allocateMultiplePins(const managed_pin_type * mptArray, byte arrayElementCount, PinOwner tag)\n{"
SINGLE_ANCHOR = "bool PinManager::allocatePin(byte gpio, bool output, PinOwner tag)\n{"
MACRO_ANCHOR = '#include "pin_manager.h"\n'
MULTI_MARKER = "HBNF_UV_FAIL_DARK_GPIO_MULTI_ADMISSION_GUARD"
SINGLE_MARKER = "HBNF_UV_FAIL_DARK_GPIO_SINGLE_ADMISSION_GUARD"
DEFAULT_MARKER = "HBNF_UV_OUTPUTS_VERIFIED_DEFAULT"
ADMISSION_MARKER = "HBNF_UV_PWM_OUTPUT_ADMITTED_DEFAULT"


def apply(root: pathlib.Path) -> None:
    path = pathlib.Path(root) / "wled00" / "pin_manager.cpp"
    source = path.read_text()
    if (MULTI_MARKER in source or SINGLE_MARKER in source
            or DEFAULT_MARKER in source or ADMISSION_MARKER in source):
        raise RuntimeError("UV GPIO admission guard is already present")
    if (source.count(MULTI_ANCHOR) != 1 or source.count(SINGLE_ANCHOR) != 1
            or source.count(MACRO_ANCHOR) != 1):
        raise RuntimeError("pinned WLED PinManager admission anchors mismatch")

    default = MACRO_ANCHOR + """// HBNF_UV_OUTPUTS_VERIFIED_DEFAULT
#ifndef HBNF_UV_OUTPUTS_VERIFIED
#define HBNF_UV_OUTPUTS_VERIFIED 0
#endif
// HBNF_UV_PWM_OUTPUT_ADMITTED_DEFAULT
#ifndef HBNF_UV_PWM_OUTPUT_ADMITTED
#define HBNF_UV_PWM_OUTPUT_ADMITTED 0
#endif
"""
    multi = MULTI_ANCHOR + """
  // HBNF_UV_FAIL_DARK_GPIO_MULTI_ADMISSION_GUARD
  #if !(HBNF_UV_OUTPUTS_VERIFIED && HBNF_UV_PWM_OUTPUT_ADMITTED)
  for (int i = 0; i < arrayElementCount; ++i) {
    if (mptArray[i].pin == 25 || mptArray[i].pin == 26) return false;
  }
  #endif
"""
    single = SINGLE_ANCHOR + """
  // HBNF_UV_FAIL_DARK_GPIO_SINGLE_ADMISSION_GUARD
  #if !(HBNF_UV_OUTPUTS_VERIFIED && HBNF_UV_PWM_OUTPUT_ADMITTED)
  if (gpio == 25 || gpio == 26) return false;
  #endif
"""
    source = source.replace(MACRO_ANCHOR, default, 1)
    source = source.replace(MULTI_ANCHOR, multi, 1)
    source = source.replace(SINGLE_ANCHOR, single, 1)
    path.write_text(source)


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        raise SystemExit("usage: guard_uv_gpio_admission.py <wled-root>")
    apply(pathlib.Path(sys.argv[1]))
    print("HBNF_UV_FAIL_DARK_GPIO_ADMISSION_PASS")
