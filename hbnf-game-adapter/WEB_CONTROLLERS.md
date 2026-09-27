# HBNF local QR controller

## Guest experience

Target UX:

**scan one QR → tap Join HBNF-Play → controller opens**

No HBNF account, pairing, email, magic link, host approval, or "enable guest" step.

The captive controller has two tabs:
- **LIGHTS** — OFF/ON/NEXT/AUTO, Matrix/AUX brightness, vibe, speed.
- **PLAY** — automatically claims the next free player slot; first/second phones become P1/P2 as available.

The printable sign contains one Wi-Fi QR. The OS captive-portal flow should open the controller automatically after joining. A short local fallback URL is printed only for phones that do not auto-open captive portals.

## Network boundary

- Bridge trusted side: `HBNF-Cart`, static `192.168.8.30`.
- Bridge guest side: isolated `HBNF-Play`, controller at `192.168.4.1`.
- Guest phones never receive the HBNF-Cart password.
- Guest phones do not need Supabase credentials.
- Cart-control requests are proxied by the bridge through one Phase-2-provisioned cart device session.
- Game input remains local WebSocket traffic; it does not traverse the cloud.

## Game behavior

- Guest play is always available when the bridge is powered.
- No host toggle is required.
- Tapping PLAY claims the first free slot and starts the game session if needed.
- Dedicated Stadia controllers retain priority and can preempt their player slot.
- Disconnect/release expires the web-controller lease quickly.
- Canonical cart OFF still terminates game visuals.

## Practical security boundary

The public/owner Phase 1 controller may remain private. The deliberately open guest surface exists only on the cart's local `HBNF-Play` network, so someone physically near the cart can use it without creating a globally open remote-control URL.

## Touch quality

The controller measures local WebSocket p50/p95 latency. Intended acceptance remains p50 <= 50 ms and p95 <= 80 ms with no obvious dropped/repeated inputs. If touch gaming fails that real-world test, Stadia remains the primary game input while QR LIGHTS controls stay available.
