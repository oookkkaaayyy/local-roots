# HBNF game adapter — parallel staging

Non-production staging on `hbnf-cart-parallel-staging-20260926`, based on the current canonical-cart release lineage.

Included:
- six-game 32x16 arcade core: Snake, 2-player Pong, Breakout, 2-player Tron / Light Cycles, Tetris, and Frogger-style lane crossing
- all game simulation/rendering runs locally on the ESP32; no internet/cloud dependency in the gameplay path
- proven DDP RGB24 packetizer for 512 pixels
- fail-closed canonical lease guard
- strict host + sanitizer QA
- controller transport/runbook

Excluded:
- automatic deploy/OTA
- Matrix/AUX firmware mutation
- Supabase production mutation
- saved Wi-Fi passwords or device secrets

Physical acceptance remains post-release.
