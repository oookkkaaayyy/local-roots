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
assert "%llu" not in formatter and "hbnf_u64_format::formatTraceRecord" in formatter
assert "trace-u64-formatter-fix-v1" in source

fixture = r'''#include <cassert>
#include <cstdint>
#include <cstring>
#include "hbnf_u64_format.h"
int main() {
  char out[192];
  assert(hbnf_u64_format::formatTraceRecord(UINT64_MAX,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,out,sizeof(out)));
  assert(std::strcmp(out,"18446744073709551615,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15")==0);
  unsigned commas=0; for(const char* p=out;*p;++p)if(*p==',')++commas; assert(commas==15);
  assert(hbnf_u64_format::formatTraceRecord(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,out,sizeof(out)));
  assert(std::strcmp(out,"0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0")==0);
  assert(hbnf_u64_format::formatTraceRecord(0,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT32_MAX,UINT8_MAX,out,sizeof(out)));
  assert(std::strcmp(out,"0,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,4294967295,255")==0);
  char shortOut[8]="stale";
  assert(!hbnf_u64_format::formatTraceRecord(UINT64_MAX,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,shortOut,sizeof(shortOut)) && shortOut[0]==0);
  return 0;
}'''
with tempfile.TemporaryDirectory(prefix="hbnf-u64-format-") as directory:
    cpp = Path(directory) / "test.cpp"
    exe = Path(directory) / "test"
    target_object = Path(directory) / "test-xtensa.o"
    cpp.write_text(fixture)
    subprocess.run(["c++", "-std=c++11", "-Wall", "-Wextra", "-Werror", "-I", str(header.parent), str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
    toolchain = Path.home() / ".platformio/packages/toolchain-xtensa-esp32/bin/xtensa-esp32-elf-g++"
    assert toolchain.is_file(), f"pinned target compiler unavailable: {toolchain}"
    subprocess.run([str(toolchain), "-std=gnu++11", "-mlongcalls", "-Wall", "-Wextra", "-Werror", "-I", str(header.parent), "-c", str(cpp), "-o", str(target_object)], check=True)
    subprocess.run([str(toolchain), "--version"], check=True, stdout=subprocess.PIPE, text=True)
print("PASS: same trace formatter emits all 16 fields, tests zero/UINT64_MAX and buffer failure; native execution and pinned Xtensa target compile PASS")
