#!/usr/bin/env python3
"""Compile and exercise the exact formatter used by diagnostic trace readback."""
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
header = ROOT / "firmware/phase2/integration-r7/usermod/hbnf_u64_format.h"
source = (ROOT / "firmware/phase2/integration-r7/usermod/usermod_hbnf_foundation_v1.cpp").read_text()
assert '#include "hbnf_u64_format.h"' in source
formatter = source.split("static void hbnfFormatTraceRecord", 1)[1].split("static bool hbnfTailSetEnabled", 1)[0]
assert "%llu" not in formatter and '"%s,%lu' in formatter

fixture = r'''#include <cassert>
#include <cstdint>
#include <cstring>
#include "hbnf_u64_format.h"
int main() {
  char out[21];
  assert(hbnf_u64_format::decimal(0, out, sizeof(out)) && std::strcmp(out,"0")==0);
  assert(hbnf_u64_format::decimal(4294967295ULL, out, sizeof(out)) && std::strcmp(out,"4294967295")==0);
  assert(hbnf_u64_format::decimal(18446744073709551615ULL, out, sizeof(out)) && std::strcmp(out,"18446744073709551615")==0);
  char shortOut[4];
  assert(!hbnf_u64_format::decimal(1234, shortOut, sizeof(shortOut)) && shortOut[0]==0);
  return 0;
}'''
with tempfile.TemporaryDirectory(prefix="hbnf-u64-format-") as directory:
    cpp = Path(directory) / "test.cpp"
    exe = Path(directory) / "test"
    cpp.write_text(fixture)
    subprocess.run(["c++", "-std=c++11", "-Wall", "-Wextra", "-Werror", "-I", str(header.parent), str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print("PASS: exact trace uint64 formatter handles zero, uint32 boundary, UINT64_MAX, and undersized buffers without %llu")
