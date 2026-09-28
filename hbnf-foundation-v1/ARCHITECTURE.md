# HBNF Foundation Rebuild V1 — Evidence-Based Architecture

Status: design contract only. Production is untouched.

## Why this rebuild exists

The existing cart stack accumulated multiple independent interpretation layers:
- browser semantic mapping
- cloud desired/reconcile/observed state
- Matrix adapter logic
- custom audio normalization/response shaping
- custom generator/randomization
- custom Matrix→AUX HBNP transport/discovery
- AUX-local WLED/audio/generator/realtime state

That creates non-local failure modes and weakens cause/effect. V1 removes layers rather than adding guards.

## External design evidence

### 1. Use native WLED DDP for the remote pixel output

WLED implements BusNetwork as a first-class virtual bus. TYPE_NET_DDP_RGB is exposed as DDP RGB (network). The bus has a normal WLED start pixel and length, buffers RGB values, and show() calls WLED's own realtimeBroadcast() DDP sender to the configured IP/hostname.

Sources:
- https://github.com/wled/WLED/blob/main/wled00/bus_manager.cpp
- https://github.com/wled/WLED/blob/main/wled00/bus_manager.h
- https://github.com/wled/WLED/blob/main/wled00/udp.cpp

Falcon Player documents DDP as UDP unicast for efficient Ethernet pixel control, including WLED. xLights describes DDP as a high-efficiency network pixel protocol and supports WLED targets.

Sources:
- https://manual.falconplayer.com/066-appendix-protocols/
- https://manual.xlights.org/xlights/chapters/chapter-four-set-up/lighting-networks/ethernet-controller

Decision:
- DELETE custom HBNP rendered-frame transport/discovery from the new foundation.
- Matrix owns a WLED-native 22-pixel DDP network bus targeted at AUX.
- AUX is a DDP realtime receiver only while linked.
- Use a DHCP reservation/static local address on the cart LAN for AUX; hostname resolution is optional.
- No broadcast/multicast for the continuous rendered pixel stream.

### 2. Disable Wi-Fi power saving for realtime nodes

Espressif documents that modem sleep can delay realtime packet reception by the AP DTIM/listen interval. WIFI_PS_NONE minimizes receive latency. Espressif also documents that broadcast/multicast is more vulnerable to packet loss while stations use power saving.

WLED's FAQ separately recommends disabling Wi-Fi Sleep to reduce lag/stuttering with realtime network lighting.

Sources:
- https://docs.espressif.com/projects/esp-idf/en/release-v5.1/esp32/api-guides/wifi.html
- https://github.com/wled/WLED-Docs/blob/main/docs/basics/faq.md

Decision:
- Matrix and AUX: Wi-Fi sleep OFF.
- Dedicated cart LAN is authoritative for realtime control/render traffic.
- Internet/hotspot is optional uplink only.

### 3. One audio engine, on Matrix only

WLED AudioReactive already provides I2S audio capture, 512-sample FFT, 16 GEQ frequency channels, noise gate/squelch, configurable gain, optional AGC, fast-rise/slower-fall FFT smoothing, a dedicated FFT task, and peak/frequency data exposed to effects.

Sources:
- https://github.com/wled/WLED/blob/main/usermods/audioreactive/audio_reactive.cpp
- https://github.com/wled/WLED-Docs/blob/main/docs/advanced/audio-reactive.md

Decision:
- Matrix is the ONLY microphone/FFT/audio-analysis node.
- AUX build contains no HBNF audio interpretation and no autonomous HBNF generator while linked.
- Consume WLED's processed 16-band data directly.
- Do not add another moving long-term baseline/novelty normalizer in front of the renderer.
- Initial commissioning uses documented squelch/gain calibration with AGC OFF for deterministic response. AGC can be evaluated later only if real-world volume variation requires it.

### 4. One render state drives both outputs

Decision:
- Matrix computes one canonical AudioFrame and one canonical VisualState per rendered frame.
- Physical Matrix renderer and 22-pixel Companion renderer consume the SAME frame state.
- Companion is NOT sampled/averaged from the finished 32x16 framebuffer.
- Companion renderer deliberately expresses the same palette, phase, direction, energy and low/mid/high events in a topology appropriate for 5/6/5/6 underglow.
- DDP sends those exact 22 rendered pixels to AUX.
- AUX brightness is applied on Matrix to the 22 companion pixels BEFORE transport.
- AUX stays at fixed realtime-receiver brightness. AUX=0 means Matrix sends exact black; no remote AUX brightness command exists in the live control path.

WLED's native DDP sender scales/transmits RGB and the DDP receiver writes realtime pixels directly. Moving independent AUX brightness ownership to the sender avoids WLED realtime briLast/override semantics entirely.

This is an adaptation specific to the cart, not a claim from WLED documentation. It follows the professional output-node pattern: one renderer/channel source, multiple output transports/fixtures.

### 5. Local controller is authoritative

WLED supports custom usermod server routes through server.on(), and WLED itself exposes local JSON/web interfaces.

Sources:
- https://github.com/wled/WLED/wiki/Add-own-functionality
- https://github.com/wled/WLED/blob/main/wled00/wled_server.cpp

Decision:
- Production live controls are served by Matrix on the cart LAN.
- Controls update canonical Matrix state directly.
- Supabase is asynchronous persistence/remote status, not in the physical control loop.
- Cloud loss, hotspot loss or Supabase failure must not affect local visual response.
- Guest QR ultimately points to the local cart controller after joining cart Wi-Fi.

### 6. Reduce sync/interface count

WLED FAQ warns that enabling too many sync interfaces can make devices lag/unresponsive.

Source:
- https://github.com/wled/WLED-Docs/blob/main/docs/basics/faq.md

Decision:
- AUX: DDP receive + minimal local management only.
- Disable HBNF MQTT control, custom HBNP, WLED notifier sync, Audio Sync and autonomous HBNF rendering on AUX in final linked mode.
- Matrix: DDP network output + local controller. Cloud telemetry is low-rate/nonblocking only.

## Canonical control model

Each live control must map directly and monotonically to one renderer quantity.

- Matrix brightness: 0..100 -> Matrix output scale 0..1
- Underglow brightness: 0..100 -> Companion output scale 0..1
- Motion: 0..100 -> one explicit animation time-scale range
- Audio response: 0..100 -> one explicit modulation-depth range
- Variation: 0..100 -> one explicit scene-evolution interval/range
- Scene: selects a documented renderer family/config; it does not silently remap other controls
- Advanced mic gain/squelch: WLED AudioReactive native parameters, not hidden semantic multipliers

No vibe categories, responseBoost indirection, hidden speed remapping, or device-specific reinterpretation.

## Audio contract

Use WLED's processed fftResult[16].

Fixed semantic bands:
- Low: channels 0..3
- Mid: channels 4..10
- High: channels 11..15

The renderer may apply fixed attack/release envelopes to these already-processed values only when the envelope constants are explicit and host-tested. No slowly adapting long-term reference level.

Control requirements:
- increasing Audio Response must never reduce modulation for an identical AudioFrame
- increasing Motion must never reduce animation phase velocity for identical state
- brightness 0 must produce exact black locally before transport
- Companion and Matrix use the same AudioFrame timestamp/sequence

## Visual contract

Novelty is subordinate to coherence.

The old anti-repeat engine optimized many dimensions simultaneously (kernel, family, palette, warp, transform, phase, profile, style, amount). V1 will instead:
- curate a smaller set of visually strong renderer families
- define a stable visual language per scene
- vary one or two dimensions at a time
- keep palette/phase/motion coherent between Matrix and Companion
- enforce repeat avoidance only where it does not destroy scene identity

## Acceptance gates before any production flash

1. Host tests prove all control mappings are monotonic and bounded.
2. Recorded/synthetic AudioFrame tests prove low/mid/high produce visibly distinct deterministic outputs.
3. Same VisualState produces deterministic Matrix + Companion frames.
4. Companion frame is rendered directly, never inferred from sampled Matrix pixels.
5. DDP output is WLED-native; no custom pixel transport exists in the new code.
6. Wi-Fi sleep disabled on Matrix and AUX.
7. AUX linked-mode code has no audio/generator ownership.
8. Local controller changes state without Supabase/MQTT dependency.
9. A 10-minute soak test has zero stalled frame counters and no control-state drift.
10. Only then create a guarded install package with the current production pair as rollback.

## Explicit non-goals for V1

- Router/games/UV work
- richer cloud telemetry
- extra scene count
- more knobs
- backwards compatibility with HBNP

First priority is crisp causality, stable sync, immediate controls and impressive audio response.
