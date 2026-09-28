# HBNF Foundation V1 — Research-backed decisions

## Sources used

- WLED official Multi-strip Support:
  https://kno.wled.ge/features/multi-strip/
- WLED official Mixed 2D and 1D Bus:
  https://kno.wled.ge/advanced/2d-1d-Mixed-Setup/
- WLED official Audio Reactive:
  https://kno.wled.ge/advanced/audio-reactive/
- WLED official WebSocket interface:
  https://kno.wled.ge/interfaces/websocket/
- WLED official JSON API:
  https://kno.wled.ge/interfaces/json-api/
- QuinLED Dig-Octa usage examples:
  https://quinled.info/quinled-dig-octa-system-usage-examples/
- Adafruit NeoPixel power/wiring guidance:
  https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels
  https://learn.adafruit.com/adafruit-neopixel-uberguide/basic-connections
- Espressif ESP-NOW documentation:
  https://docs.espressif.com/projects/arduino-esp32/en/latest/api/espnow.html

## Decision hierarchy

### 1. Primary physical architecture: one ESP32 owns every live pixel

WLED explicitly supports a 2D matrix plus a 1D strip on one unit, including a strip chained after a matrix on the same pin. It also supports multiple LED outputs from one ESP32.

For this cart the preferred architecture is therefore:

- one ESP32
- one microphone/audio source
- one canonical effect clock
- one canonical audio frame
- Matrix LEDs + AUX LEDs owned by the same WLED instance
- no network transport in the visual loop

This removes synchronization as a problem instead of trying to compensate for it.

Current GL-MC-001WL has one data output. Two viable physical implementations are:
A. Matrix DOUT -> AUX DIN as one continuous mixed 2D+1D chain, if the existing connectors make this clean and safe.
B. Replace the mini controller with a proper multi-output ESP32 controller and drive Matrix/AUX on separate data outputs from the same MCU.

A is cheapest and has the fewest active components. B is easier to service and isolates the buses.

### 2. Secondary architecture only if physical single-MCU wiring is rejected

If Matrix and AUX must remain separate controllers:
- prefer standard WLED DDP / Virtual LED mechanisms over custom UDP framing
- wired Ethernet is preferred for continuous multi-controller pixel transport when practical
- ESP-NOW is a possible direct peer transport on ESP32, but requires explicit ACK/sequence handling and is not the first choice for a same-cart installation

Custom HBNP broadcast/unicast projection is retired from the foundation.

### 3. Audio: use WLED AudioReactive as the DSP source

Use one digital microphone and one AudioReactive instance.

Calibration procedure follows WLED guidance:
- calibrate squelch first in quiet conditions
- calibrate gain at normal playback volume
- begin with AGC off so response is deterministic
- optionally test WLED Normal/Vivid AGC later if field volume varies enough to justify it

Foundation V1 does NOT apply another minutes-long adaptive normalization layer on top of WLED FFT results.

### 4. Controls: local first, cloud second

WLED WebSocket /ws is the live-control interface:
- persistent local socket
- command and state on one connection
- push state updates
- no polling loop
- no Supabase in the physical response path

Supabase becomes asynchronous persistence/history/remote status only.

### 5. Control semantics must be literal

Do not translate a user control through multiple hidden concepts.

Foundation controls:
- Audio Response = direct modulation gain
- Motion = direct animation time-scale
- Evolution = explicit structural-change interval
- Matrix Brightness = native WLED Matrix-segment brightness
- AUX Brightness = native WLED AUX-segment brightness
- Mic Gain and Squelch remain native WLED AudioReactive settings

Remove the old Energy -> vibe-category mapping.

### 6. AUX is not a second renderer

AUX has no:
- independent scene generator
- independent audio analyzer
- independent effect clock
- independent palette choice

The same canonical frame renders both surfaces.

### 7. Acceptance criteria

Nothing ships because a backend field says APPLIED.

Required physical acceptance:
- control latency visibly immediate on local LAN
- 0 brightness physically means off
- AUX color family is unmistakably the same as Matrix
- motion events begin in the same frame/beat family
- bass/mid/high tests produce deliberately different and obvious responses
- same slider move produces repeatable result
- no cloud connection required for live control
- disconnect/reconnect cannot silently switch renderer modes

### 8. Use native WLED brightness semantics

Foundation V1 does not implement custom brightness scaling. Matrix and AUX are separate WLED segments and use native segment brightness over the local JSON/WebSocket API. The custom renderer does not use realtime mode, so segment brightness cannot be bypassed by realtime pixel writes.

### 9. Three-band audio uses WLED's own representative GEQ bins

WLED AudioReactive's built-in Spectrum audio palette uses fftResult[0], fftResult[4], and fftResult[10] as its three representative frequency signals. Foundation V1 follows that existing convention for low/mid/high rather than averaging broad custom frequency ranges. This keeps the response closer to WLED's native post-processed signal and avoids an additional smoothing layer.
