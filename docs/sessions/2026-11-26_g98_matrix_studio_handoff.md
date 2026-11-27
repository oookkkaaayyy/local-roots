# 2026-11-26 g97/g98 Matrix frenzy fix, Studio viewport, handoff
(Belongs in hbnf-site PROJECT_MEMORY/sessions; hbnf-site branch creation was refused in this session. Copy over next session.)

## Matrix (Elite 192.168.77.10)
- Cause: quiet room gave intermittent flat broadband FFT frames (all bins ~60-101) that the g89 normalizer, Flux16 onset detector and Auto logic treated as loud music. Auto also boosted sensitivity when quiet (autoResp up to 96).
- g97: flat-burst rejection (12+ bins >=200), non-boosting normalizer.
- g98 FLASHED (work/g98/matrix_elite_g98b.bin): hbnfFlatBurst also rejects frames with bin1>=40 and bins 5, 8, 14 each >= 1/3 of bin1; Flux16 min range 10->24; Auto resp = clamp((62-24*autoE)*(0.6+0.4*mus)*agc,28,82), agc 0.75..1.15. Quiet room: fft 0, autoResp ~45-66, beatConf mostly 0.
- NOT tested with music. Risks: low-volume music rejected as flat, or response too weak. Test at 25% volume, course music only, cart all off after, underglow max.
- Rollback: work/g93/matrix_elite_g96.bin, work/g97/matrix_elite_g97.bin. Flash: ssh cat bin to Opal /tmp/x.bin, then on Opal curl -F update=@/tmp/x.bin http://192.168.77.10/update; verify cfg.json has "matrix" once, else restore work/matrix_tuning/g75/elite_cfg_pre_g93.json via /upload.
- Build: sandbox ~/b/W2, pio run -e hbnf_elite_slim2. IRAM nearly full: keep helpers tiny (a fuller min/max check overflowed iram0_0_seg by 1252 bytes).
- Sources: work/g98/.

## Layout Builder
- PR 372 (ae6819e): opaque status bar, no viewport-fit=cover, no safe-area padding, no 100dvh override. Re-add the home-screen icon if the old setting is cached.

## Open
- Supabase HBNF phcpbvuqibyarpfrftgx Unhealthy (522); org quota warning, restriction from 2026-12-09. Pad/basket merges blocked on it (hbnf_studio_pins, hbnf_studio_state).
- Owner-only: iPad shortcut, UDisc round, :9443 cert before 2027-01-24, RSEC key rotation.
