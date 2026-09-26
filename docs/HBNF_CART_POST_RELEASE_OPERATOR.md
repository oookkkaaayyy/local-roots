# HBNF post-release operator path

After the current canonical Matrix+AUX release is physically accepted, use one entry point:

scripts/HBNF_POST_RELEASE_SETUP.command

It is interactive only at unavoidable physical gates. Everything software-verifiable is checked automatically and evidence is written to a timestamped Desktop folder.

Automates router-manifest validation, LAN discovery by device identity, exact DHCP-reservation instructions, direct-IP preflight, a second preflight after cold boot, handoff to the packaged bridge flasher/provisioner, game/global-OFF/current-state-resume acceptance, and evidence capture.

It deliberately does not automate GL.iNet credentials, DHCP-reservation clicks, Matrix/AUX firmware flashing, production Supabase changes, physical controller button presses, UV wiring/energizing, or physical acceptance without operator confirmation.

If BLE pairing fails, stop only the game workstream. If UV remains unverified, leave UV separate. Neither failure should disturb the accepted canonical cart.


Network migration is rollback-safe: the operator first captures Matrix/AUX read-only state + cfg.json on the legacy LAN, then opens each device's WLED Wi-Fi page and instructs the operator to add HBNF-Cart as a second WLED Wi-Fi profile. The existing profile is retained until the new LAN has passed cold-boot validation.
