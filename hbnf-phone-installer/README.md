# HBNF iPhone Field Installer

This is an independent phone-OTA fallback for the HBNF cart. It is intentionally
kept separate from the main matched-release branch so it cannot interfere with
firmware/package CI.

## What it does

A Mac preparation script copies the final matched Matrix/AUX firmware into the
Shortcuts iCloud Drive container and generates a **signed Apple Shortcut**.
The signed shortcut syncs through iCloud and can be imported/run on the iPhone.

At the course, the Shortcut:

1. Reads `/json/info` from `172.20.10.2` and `.3`.
2. Requires an exact hardware identity before OTA:
   - Matrix = 512 LEDs
   - AUX = 22 LEDs
3. Automatically swaps the two IPs if DHCP order is reversed.
4. Refuses to flash if the pair is not positively identified.
5. Loads `HBNF_MATRIX.bin` and `HBNF_AUX.bin` from
   iCloud Drive > Shortcuts > HBNF_FIELD_DEPLOY.
6. Uploads each image to the correct local WLED `/update` endpoint as
   multipart/form-data.
7. Waits for reboot and checks that both nodes return.
8. Tells the user to resume the already-approved cloud cutover in ChatGPT/Codex.

## Important limitation

The Shortcut deliberately handles **physical firmware OTA only**. It does not
carry Supabase management credentials and does not deploy/migrate the cloud
control plane from an iPhone. That part remains server-side and can be resumed
from ChatGPT/Codex after the Shortcut reports success.

## Build on the user's Mac

```bash
chmod +x PREPARE_HBNF_PHONE_INSTALL.command
./PREPARE_HBNF_PHONE_INSTALL.command /path/to/MATRIX.bin /path/to/AUX.bin
```

macOS's built-in `shortcuts sign --mode anyone` signs the generated file, so
iOS can import it. Apple requires an explicit Add Shortcut confirmation; this
cannot safely be bypassed.

## Course network assumption

For the one-tap path, toggle Personal Hotspot off/on immediately before powering
the cart, with other hotspot clients disconnected. iPhone Personal Hotspot uses
`172.20.10.0/28`; the first two clients are expected at `.2` and `.3`.
The Shortcut verifies device identities before flashing, so an unexpected DHCP
layout fails closed rather than risking a cross-flash.
