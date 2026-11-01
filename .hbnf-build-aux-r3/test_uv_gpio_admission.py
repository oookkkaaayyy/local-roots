#!/usr/bin/env python3
"""Focused offline admission test against the patched pinned WLED source."""
from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile


def main(root: pathlib.Path) -> None:
    source = (root / "wled00" / "pin_manager.cpp").read_text()
    multi_start = source.index("bool PinManager::allocateMultiplePins(const managed_pin_type * mptArray")
    multi_end = source.index("\nbool PinManager::allocateMultiplePins(const int8_t", multi_start)
    multi = source[multi_start:multi_end]
    single_start = source.index("bool PinManager::allocatePin(byte gpio, bool output, PinOwner tag)")
    single_end = source.index("\nbool PinManager::isPinAllocated", single_start)
    single = source[single_start:single_end]

    assert "HBNF_UV_FAIL_DARK_GPIO_MULTI_ADMISSION_GUARD" in multi
    assert multi.index("mptArray[i].pin == 25") < multi.index("bool shouldFail = false;")
    assert "HBNF_UV_FAIL_DARK_GPIO_SINGLE_ADMISSION_GUARD" in single
    assert single.index("gpio == 25") < single.index("if (!isPinOk(gpio, output)")
    assert "HBNF_UV_OUTPUTS_VERIFIED_DEFAULT" in source
    assert "#define HBNF_UV_OUTPUTS_VERIFIED 0" in source
    admission_expression = "#if !(HBNF_UV_OUTPUTS_VERIFIED && HBNF_UV_PWM_OUTPUT_ADMITTED)"
    assert admission_expression in multi and admission_expression in single

    # PinManager denial makes WLED's PWM constructor return before LEDC setup;
    # the existing BusPwm path checks allocation before attaching any output.
    bus = (root / "wled00" / "bus_manager.cpp").read_text()
    pwm_start = bus.index("BusPwm::BusPwm(const BusConfig &bc)")
    pwm_end = bus.index("\n}\n", pwm_start)
    pwm_ctor = bus[pwm_start:pwm_end]
    assert "if (PinManager::allocateMultiplePins(pins, numPins, PinOwner::BusPwm))" in pwm_ctor
    assert pwm_ctor.index("allocateMultiplePins") < pwm_ctor.index("ledcAttachPin")

    patcher = pathlib.Path(__file__).with_name("apply_aux_r3.py").read_text()
    assert "from guard_uv_gpio_admission import apply as apply_uv_gpio_admission" in patcher
    assert "apply_uv_gpio_admission(root)" in patcher

    workflow = pathlib.Path(__file__).parents[1] / ".github" / "workflows" / "hbnf-sp803e-aux-r3-build.yml"
    build = workflow.read_text()
    assert "HBNF_UV_BUILD_FLAG" in build and "uv-enabled-review" in build
    assert "disabled-default" in build and "'0'" in build
    assert "-D HBNF_UV_OUTPUTS_VERIFIED=@UV_GATE@" in build
    assert "-D HBNF_UV_PWM_OUTPUT_ADMITTED" not in build, "review builds must not admit physical UV outputs"

    # Compile and run the exact guarded checks from the transformed WLED source
    # under both macro values, covering PWM/digital/relay allocation callsites.
    default_start = source.index("#ifndef HBNF_UV_OUTPUTS_VERIFIED")
    default_guard = source[default_start:source.index("\n\n", default_start)]
    multi_guard_start = multi.index(admission_expression)
    multi_guard = multi[multi_guard_start:multi.index("#endif", multi_guard_start) + len("#endif")]
    single_guard_start = single.index(admission_expression)
    single_guard = single[single_guard_start:single.index("#endif", single_guard_start) + len("#endif")]
    harness = """#include <cstdint>
struct managed_pin_type { uint8_t pin; bool isOutput; };
""" + default_guard + """
bool many(managed_pin_type *mptArray, int arrayElementCount) {
""" + multi_guard + """
  return true;
}
bool one(uint8_t gpio, bool output) {
""" + single_guard + """
  return true;
}
int main() {
#if HBNF_UV_OUTPUTS_VERIFIED && HBNF_UV_PWM_OUTPUT_ADMITTED
  if (!one(25, true) || !one(26, false)) return 1;
  managed_pin_type a[] = {{25,true},{26,true}};
  if (!many(a,2)) return 2;
#else
  if (one(25, true) || one(26, false) || !one(16, true)) return 3;
  managed_pin_type a[] = {{16,true},{25,true}};
  if (many(a,2)) return 4;
  managed_pin_type b[] = {{16,true}};
  if (!many(b,1)) return 5;
#endif
  return 0;
}
"""
    with tempfile.TemporaryDirectory() as directory:
        cpp = pathlib.Path(directory) / "admission.cpp"
        cpp.write_text(harness)
        for output_capable, admitted in ((False, False), (True, False), (False, True), (True, True)):
            label = f"capable-{int(output_capable)}-admitted-{int(admitted)}"
            binary = pathlib.Path(directory) / label
            cmd = ["g++", "-std=c++11", str(cpp), "-o", str(binary)]
            if output_capable:
                cmd.insert(1, "-DHBNF_UV_OUTPUTS_VERIFIED=1")
            if admitted:
                cmd.insert(1, "-DHBNF_UV_PWM_OUTPUT_ADMITTED=1")
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            subprocess.run([str(binary)], check=True, capture_output=True, text=True)
    print("HBNF_UV_FAIL_DARK_GPIO_ADMISSION_TEST_PASS")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: test_uv_gpio_admission.py <patched-wled-root>")
    main(pathlib.Path(sys.argv[1]))
