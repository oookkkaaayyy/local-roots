# Owner local UV lock storage v1.0.24

The installed v1.0.23 moved UV command locking into its own 8 KiB Nginx shared-memory zone, but the commissioning test still returned HTTP 429 after a full dedicated-gateway restart. This release expands that isolated zone to 64 KiB and reports missing/exhausted lock storage as HTTP 503, reserving HTTP 429 for a genuinely active lock. It does not relax UV hardware readiness, manual/follow gates, or the three-second single-channel test.

The installer updates only the dedicated gateway's UV policy module and its Nginx server include. It retains the exact current v1.0.23 twenty-file rollback, validates Nginx before and after the change, reloads only the dedicated local gateway, and checks read-only status plus existing authorization/origin protections. It does not issue a valid UV output command.
