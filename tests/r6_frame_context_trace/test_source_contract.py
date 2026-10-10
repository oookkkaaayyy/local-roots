from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "firmware/phase2/integration-r6/usermod/usermod_hbnf_foundation_v1.cpp"
HEADER = ROOT / "firmware/phase2/integration-r6/usermod/hbnf_outlier_trace.h"
source = SRC.read_text()
header = HEADER.read_text()

assert '#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)' in source
assert '#include "hbnf_outlier_trace.h"' in source
assert 'HBNF_R6_OUTLIER_CAPACITY=16' in source
assert 'HBNF_R6_REFERENCE_INTERVAL=256' in source
assert 'ReferenceStore<HBNF_R6_REFERENCE_CAPACITY>' in source
assert 'hbnfTraceFrame=&f' in source
assert '(outlier||reference)' in source
assert 'framePreparationCcountElapsedCycles' in source
assert 'schedulerCcountElapsedCycles' not in source
assert 'taskRuntimeStatsAvailable' in source and 'false' in source
context_fn = source.split('static void hbnfTraceContext(', 1)[1].split('\n}', 1)[0]
assert 'if(!hbnfTraceFrameActive)' not in context_fn
assert 'hbnfTraceWorking.frame=f.frame' in context_fn
assert 'hbnfTraceWorking.current' in context_fn and 'hbnfTraceWorking.previous' in context_fn
assert 'hbnfTraceWorking.vibeAudioInputFloatBits' in context_fn
assert 'HBNF_R6_REFERENCE_INTERVAL=256' in source
assert 'cursor!=0' in source
for name in ('bass', 'mid', 'treble', 'bassBody', 'bassPulse', 'energy', 'slowEnergy'):
    assert f'"{name}"' in source
for name in ('energyShort', 'energyMedium', 'lowPressure', 'highDetail', 'silenceConfidence'):
    assert f'"{name}"' in source
for name in ('bassAtt', 'midAtt', 'trebleAtt', 'bassPulse', 'midPulse', 'treblePulse', 'lowEnergy', 'transient'):
    assert f'"{name}"' in source

def mapped_names(array_name):
    match = re.search(rf'{array_name}\[(\d+)\]=\{{([^}}]+)\}};', source)
    assert match, f'missing named mapping {array_name}'
    names = re.findall(r'"([^"]+)"', match.group(2))
    assert len(names) == int(match.group(1)), f'{array_name} field count mismatch'
    return names

assert mapped_names('afNames') == [
    'bass', 'mid', 'treble', 'volume', 'peak', 'bassBody', 'midBody',
    'trebleBody', 'bassPulse', 'midPulse', 'treblePulse', 'energy',
    'lowEnergy', 'midEnergy', 'highEnergy', 'transient', 'slowEnergy']
assert mapped_names('featureNames') == [
    'energyShort', 'energyMedium', 'energySlow', 'lowPressure', 'lowTransient',
    'midBody', 'midChange', 'highDetail', 'highTransient', 'spectralBrightness',
    'spectralChange', 'activity', 'silenceConfidence']
assert mapped_names('inputNames') == [
    'volume', 'bassAtt', 'midAtt', 'trebleAtt', 'bassPulse', 'midPulse',
    'treblePulse', 'energy', 'lowEnergy', 'midEnergy', 'highEnergy',
    'transient', 'slowEnergy']
assert mapped_names('axisNames') == [
    'structure', 'flow', 'depth', 'symmetry', 'detail', 'paletteMotion',
    'density', 'negativeSpace', 'transitionEnergy']

# The disabled production build removes the instrumentation include, buffers,
# capture calls, and ESP timer/task queries at preprocessing time.
assert source.count('#if defined(HBNF_R6_FRAME_CONTEXT_TRACE)') >= 10
for token in ('hbnfTraceStartFrame();', 'hbnfTraceContext(', 'hbnfTraceEndFrame();', 'esp_timer_get_time()', 'xTaskGetCurrentTaskHandle()'):
    assert token in source

# Hot-path capture helpers must remain bounded and side-effect-free except for
# fixed copies, platform context reads, and the fixed-capacity trace store.
for func in ('hbnfTraceContext', 'hbnfTraceEndFrame'):
    start = source.index(f'static void {func}(')
    brace = source.index('{', start)
    depth = 0
    end = brace
    for end in range(brace, len(source)):
        depth += source[end] == '{'
        depth -= source[end] == '}'
        if depth == 0:
            break
    body = source[brace:end + 1]
    assert not re.search(r'\b(new|malloc|calloc|realloc|Serial|WiFi|HTTPClient|esp_http_client)\b', body), func

assert 'void start()' in header and 'records_[next_]=record' in header
assert 'worst_=record' in header and 'overflowCount_' in header
assert 'void stop()' in header and 'append(const Record& record)' in header
print('PASS R6 trace source contract: compile-gated, bounded, named audio mappings, no hot-path I/O/allocation')
