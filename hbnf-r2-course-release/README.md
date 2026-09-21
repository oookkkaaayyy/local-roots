HBNF Matrix R2 Course release backend snapshot

CURRENT PRODUCTION SNAPSHOT
Production Edge Function: hbnf-matrix-control
Version: 123
SHA256: 0f92485414ca65ac0eec454ecbcbaf023a526f3ea6ed2479c6775eac2a0ec2aa
Release: hbnf-r2-course-2026-09-20-v1

R2 COURSE CONTRACT
- preset 55 = LEGACY SAFE
- preset 60 = R2 COURSE playlist
- presets 61-68 = R2 ANIMartRIX scenes
- control show_family=r2 is permitted by production DB constraint
- explicit R2 play_show / next_look / brightness / round_ready handling
- state-only r2_adopt
- legacy library refresh blocked while R2 is active unless forceLegacy=true
- status reports renderEngine=r2-animartrix-vibe when R2 owns the controller

AUDIO
- production backend AUDIO_INPUT_LEVEL default was raised from 220 to 255 on 2026-09-20 after human physical observation that normal cart speaker distance was under-responsive.
- a runtime audio_sensitivity=255 command was published successfully.
- IMPORTANT: WLED AudioReactive inputLevel is JSON runtime state, not a persisted cfg.json setting in upstream WLED 16.0.1. The current R2 scene/playlist package was originally generated with no persistent 255 field and installer activation used 220. Therefore max sensitivity across a raw cold boot still needs an explicit durable R2-preset/firmware strategy and verification. Do not falsely claim that part is complete.

RUNTIME ACCEPTANCE
- true cold boot passed into R2 playlist at brightness8
- playlistActive=1 observed advancing among R2 scenes
- backend ownership synchronized to show_family=r2 / show_preset=60 / resume_preset=60 / library revision hbnf-r2-course-2026-09-20-v1
- human confirmed R2 works; response was pronounced mainly when speaker was close to controller/mic, motivating max-sensitivity default.

UI/WATCH
- production R2 phone UI was deployed by local Codex, build marker hbnf-build-9.20.26-r2-course-v1, Cloudflare deployment version 5496f99a-fa5f-442b-80c3-1482c26648b6.
- Apple Watch user-facing control is NOT yet production-verified. Supabase hbnf-watch-score v3 exists for score entry, but an actual Watch Shortcut/app installation, token provisioning, Matrix show controls, and field QA remain.

Do not merge this temporary release branch into main without later review.
