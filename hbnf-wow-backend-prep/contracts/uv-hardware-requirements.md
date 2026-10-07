# AUX UV hardware capability requirement

Software support is not evidence that the hardware is present. Before enabling any UV output, an offline inspection/commissioning record must identify:

1. AUX ESP32 board model/revision and WLED 16.0.1 build/config identity.
2. One independently addressable WLED LED output configured as a non-addressable PWM channel (or a verified independent WLED segment/output mapping if the installed topology supports it), with a free, boot-safe GPIO confirmed against the exact board pinout.
3. A low-side logic-level MOSFET stage appropriate to the UV strip's rated voltage and worst-case current, with thermal/current margin, fuse, wiring gauge, and common ground consistent with WLED wiring guidance. ESP32 GPIO must drive only the MOSFET gate/input, never the strip load.
4. UV strip voltage/current/nameplate, polarity, connector, physical placement, heat dissipation, and a verified safe OFF state on power-up, reboot, network loss, and WLED restart.
5. UV strip wavelength/peak and irradiance from a traceable datasheet or measurement, plus the planned distance/exposure context. UVA, UVB, and UVC are materially different; do not infer wavelength or safety from a product label. CDC notes UV overexposure can injure skin and eyes; if UVC is present, do not energize an exposed strip or permit line-of-sight exposure. Require a documented optical exposure/safety review and shielding/placement before any live use.
6. Independent OFF, dimming curve, configured cap, transition/ramp, underglow coexistence, and owner override behavior validated on a current-limited bench before integration.

No current source proves this dedicated UV hardware exists or identifies its wavelength. Existing AUX connectivity and stability are not blockers; the exact independent output/load-driving stage and optical exposure profile are the open physical capability checks.

Safety source: CDC, [Ultraviolet Radiation](https://www.cdc.gov/radiation-health/features/uv-radiation.html).
