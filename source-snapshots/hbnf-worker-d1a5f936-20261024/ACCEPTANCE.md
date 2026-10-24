# HBNF scoring field acceptance

Run only after the exact candidate has been previewed and a disposable scorecard/write test is authorized. Do not use October 20 or Glow as test data. Use one explicitly disposable Skins date/card, and record its date before starting.

1. On the iPhone PWA, enter one clearly marked temporary scorecard change. Confirm the UI first shows pending/saving and then **Saved to cloud** only after the Supabase update returns the row. Record the scorecard date and displayed status.
2. Independently read `league_state` row `id=1` in Supabase read-only tooling. Confirm `updated_at` advanced and only the temporary `skins.weeks[date]` path changed; compare the other root fields, including tags, lifetime stats, ace balances, and backup history, with the before snapshot.
3. Reopen `/skins` on the iPhone and refresh once. On a second device/browser, verify the official score feed shows the temporary result, then open Matrix and verify the same score is displayed after refresh/reconnect. Repeat a single edit while offline, reconnect, and require the existing conflict-safe retry plus independent row readback.
4. Use the app's supported **Delete Selected Week** control for that temporary date. Confirm the recovery snapshot exists before deletion, the date disappears after refresh on both clients, and Round Tags cleanup is scoped to that date and `event_type=skins`.
5. Independently read the row again. Confirm the temporary date is absent/tombstoned, all pre-existing weeks, finalized October 20 results, bag-tag custody, historical stats, ace balances, and backups equal the before snapshot. Record the new row revision and retain both readbacks.

PASS requires the client acknowledgment, two independent row readbacks, iPhone reopen, second-device confirmation, offline recovery, deletion, and exact preservation checks. A mock test, preview, or owner report alone is not field acceptance. If the temporary write cannot be isolated and authorized, defer this check to one ordinary Skins round and test only the genuine entry already required for play.
