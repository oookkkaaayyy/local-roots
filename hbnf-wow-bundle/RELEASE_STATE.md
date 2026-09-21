# HBNF Matrix WOW R3 — bundled release checkpoint

Release: hbnf-wow-r3-2026-09-21-v1

- Production backend: hbnf-matrix-control v130
- Backend SHA256: 52f60aac7902d2a74409574aac3a021501333918fd85f10ef97dab9f5c9ed4d8
- Firmware SHA256: f2e78c4a1e879e3e6a22596cd71ada2312688b1f2a7b07c38db762432a09d89c
- Firmware bytes: 1354560
- OTA headroom: 218304 bytes
- Second clean compile byte-identical: PASS
- Host 3-band/profile tests: PASS
- Scene pack: 28 ANIMartRIX scenes, presets 61–88, playlist60, 18 s holds, 1.2 s transitions
- Profiles: bass, mid, balanced, treble, full, impact
- AudioReactive inputLevel=255 durable in every scene
- HBNFFlow disabled in every scene
- R2 rollback firmware retained exactly
- Current R2 production state remained unchanged after backend v130 deployment
- False R3 adoption on current R2 correctly refused
- Final atomic package Drive ID: 1LeFSGbiJPGiBUtiTlQQTGqQvU_EeDZZy
- Final atomic package SHA256: 72dc07489f1ea80ee6c76b3aa482004bc33c207a154d04cd7d196ac1b7f9c546

Remaining physical gates only: one bundled install/reboot, one true 5-second cold boot, one consolidated music/visual review.
