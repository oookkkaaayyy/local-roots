# HBNF game adapter — parallel staging

Non-production staging on `hbnf-cart-parallel-staging-20260926`, based on the current canonical-cart release lineage.

Included:
- proven 32x16 Snake + two-player Pong core from `hbnf-matrix-games-lab-20260923`
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
