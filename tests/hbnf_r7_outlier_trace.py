#!/usr/bin/env python3
"""Host regression checks for the bounded R7 frame-outlier trace."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HEADER = ROOT / "firmware/phase2/integration-r7/usermod/hbnf_outlier_trace.h"
SOURCE = ROOT / "firmware/phase2/integration-r7/usermod/usermod_hbnf_foundation_v1.cpp"

HARNESS = r'''
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include "hbnf_outlier_trace.h"

int main() {
  using hbnf_outlier_trace::Record;
  hbnf_outlier_trace::Store<3> trace;
  static_assert(sizeof(hbnf_outlier_trace::Store<32>)<=2500, "bounded trace RAM budget exceeded");
  assert(!hbnf_outlier_trace::exceeds(6725000,6725000));
  assert(hbnf_outlier_trace::exceeds(6725001,6725000));
  assert(!hbnf_outlier_trace::exceeds(6724999,6725000));
  Record r{};
  r.wholeFrameCycles=900;
  assert(!trace.append(r));
  assert(trace.count()==0 && trace.outlierCount()==0 && trace.overflowCount()==0);
  assert(!trace.worstValid());

  trace.start();
  assert(trace.armed());
  assert(trace.nextFrameSequence()==1);
  r.monotonicUs=123456789; r.frameSequence=1; r.frameStartCycles=4294967200u;
  r.frameEndCycles=804; r.wholeFrameCycles=900; r.kernelGrossCycles=600;
  r.audioCycles=55; r.colorCycles=56; r.schedulerCycles=57; r.overlayCycles=58;
  r.companionPrepCycles=59; r.ddpSendCycles=60; r.unaccountedCycles=61;
  r.kernelId=13; r.variantSignature=0xaabbccdd;
  assert(trace.append(r));
  trace.setLastCaptureBodyCycles(77);
  for (uint32_t i=2;i<=5;i++) {
    assert(trace.nextFrameSequence()==i);
    r.frameSequence=i; r.wholeFrameCycles=100*i;
    assert(trace.append(r));
  }
  assert(trace.count()==3);
  assert(trace.outlierCount()==5);
  assert(trace.overflowCount()==2);
  assert(trace.chronological(0).frameSequence==3);
  assert(trace.chronological(1).frameSequence==4);
  assert(trace.chronological(2).frameSequence==5);
  assert(trace.worstValid());
  assert(trace.worst().frameSequence==1);
  assert(trace.worst().wholeFrameCycles==900 && trace.worst().traceCaptureBodyCycles==77);
  assert(trace.worst().kernelId==13 && trace.worst().variantSignature==0xaabbccdd);
  assert(trace.worst().frameStartCycles==4294967200u && trace.worst().frameEndCycles==804);
  assert((uint32_t)(trace.worst().frameEndCycles-trace.worst().frameStartCycles)==trace.worst().wholeFrameCycles);
  assert(trace.worst().kernelGrossCycles==600 && trace.worst().audioCycles==55);
  assert(trace.worst().colorCycles==56 && trace.worst().schedulerCycles==57);
  assert(trace.worst().overlayCycles==58 && trace.worst().companionPrepCycles==59);
  assert(trace.worst().ddpSendCycles==60 && trace.worst().unaccountedCycles==61);
  trace.stop();
  assert(!trace.armed());
  const uint32_t oldCount=trace.count(),oldOverflow=trace.overflowCount(),oldOutliers=trace.outlierCount();
  assert(!trace.append(r));
  assert(trace.count()==oldCount && trace.overflowCount()==oldOverflow && trace.outlierCount()==oldOutliers);
  assert(trace.worst().frameSequence==1);
  assert(trace.resume());
  assert(trace.armed() && trace.count()==oldCount && trace.overflowCount()==oldOverflow);
  assert(trace.nextFrameSequence()==6);
  r.frameSequence=6;r.wholeFrameCycles=100;
  assert(trace.append(r));
  assert(trace.count()==3 && trace.outlierCount()==6 && trace.overflowCount()==3);
  trace.stop();
  hbnf_outlier_trace::Store<3> neverStarted;
  assert(!neverStarted.resume() && !neverStarted.armed());
  printf("record_size=%zu store_size=%zu retained=%u overflow=%u worst=%u\n",
    sizeof(Record),sizeof(trace),trace.count(),trace.overflowCount(),trace.worst().wholeFrameCycles);
  return 0;
}
'''

with tempfile.TemporaryDirectory(prefix="hbnf-r7-trace-host-") as td:
    source = Path(td) / "trace_test.cpp"
    binary = Path(td) / "trace_test"
    source.write_text(HARNESS)
    subprocess.run(["c++", "-std=c++11", "-O2", "-Wall", "-Wextra", "-Werror",
                    "-I", str(HEADER.parent), str(source), "-o", str(binary)], check=True)
    result = subprocess.run([str(binary)], check=True, text=True, capture_output=True)
    print(result.stdout.strip())

text = SOURCE.read_text()
frame_end = text.split('extern "C" void hbnfPerfFrameEnd() {', 1)[1]
frame_end = frame_end.split('\n}', 1)[0]
assert "hbnfOutlierTrace.armed()" in frame_end
assert "hbnfOutlierTrace.nextFrameSequence()" in frame_end
assert "hbnf_outlier_trace::exceeds(hbnfPerfWorking.whole,hbnfOutlierThresholdCycles)" in frame_end
assert "esp_timer_get_time()" in frame_end
assert "hbnfOutlierTrace.append(record)" in frame_end
assert "hbnfOutlierTrace.setLastCaptureBodyCycles" in frame_end
assert "HBNF_OUTLIER_TRACE_CAPACITY=32" in text
assert "42.03125" in text
assert 'hbnf-cart2-r7-outlier-trace-diagnostic-r2-u64fix-20261009' in text
assert '22305354031b5ecf83e6da4459a775143c34cb19c156b64f68232d887cb16994' in text
assert '"outlierTraceCommand"' in text
assert 'recoverySnapshotReady' in text
assert 'runtime.diagnosticActive()' in text
assert 'traceOp,"resume"' in text and 'hbnfOutlierTrace.resume()' in text
assert 'cpuMHzAtTraceStart' in text and 'cpuMHzAtReadback' in text
assert '"outlierTrace"' in text and '"records"' in text and '"worstRecord"' in text
assert "new hbnf_outlier_trace" not in frame_end
assert "malloc" not in frame_end and "Serial" not in frame_end
assert "WiFi" not in frame_end and "HTTP" not in frame_end
print("R7 outlier trace integration contract PASS")
