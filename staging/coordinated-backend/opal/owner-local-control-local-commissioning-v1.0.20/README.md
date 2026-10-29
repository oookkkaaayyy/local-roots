# Cart-local UV commissioning access v1.0.20

The owner explicitly accepts low-friction unpaired control from HBNF-Cart Wi-Fi. This narrow package lets the exact Opal-local PWA read UV readiness and reach the existing validated UV policy handler without a paired Owner token. The public HTTPS origin still requires the paired Owner token; unknown web origins remain denied by the installed gateway configuration.

This does not enable the UV outputs by itself. The existing hardware profile, power, channel, current, thermal, firmware, and readback gates remain in force for normal Manual and Follow Matrix operation. The existing three-second single-channel commissioning pulse remains the only output test before full profile acceptance and always sends both channels OFF afterward. The installer verifies a local status response and an intentionally invalid command rejected before AUX dispatch; it does not issue a WLED/UV write, flash firmware, or alter Matrix/underglow.

Only `uv_status_access.lua` and `uv_policy_access.lua` change. Exact live baseline, rollback, candidate, one-time admission, and post-install readback are retained.
