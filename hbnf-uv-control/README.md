# HBNF UV control — safe minimal staged path

Nothing here changes wiring or energizes UV.

## Exact current hardware
- two 5V UV strips, each ending in USB-A male
- both may switch together
- separate 5V UV power bank available
- selected switch path: HiLetgo B00LW15D1M 12V one-channel relay
- relay control source: spare SP803E low-side/PWM output only after post-release pin/polarity validation
- UV load path: separate 5V bank -> switched +5V USB feed -> both UV strips
- never connect UV to SP803E 12V VCC

## Safety contract
Relay ON requires all four: UV requested, canonical cart ON, AUX online, canonical sample <=1.5 s old.
Any OFF/stale/AUX-loss/startup/uncertainty resolves to relay OFF.

Keep UV outside the canonical Matrix/AUX fan-out for this staging pass. This avoids changing the main release while preserving global OFF priority in the eventual adapter.
