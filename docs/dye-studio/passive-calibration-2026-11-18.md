# D&U passive dye calibration (applied 2026-11-18)

Project: wtymjxscneufjlkkywyg (Dyed & Unattached). Migration: `du_passive_dye_calibration_v1` (additive; no deletes).

## Objects
- `public.du_dye_calibration_samples` (RLS on, service_role only). One row per (job_id, region_label). Fields: plastic, disc_model, medium, process, stencil, dyes jsonb, predicted_rgb, predicted_source, predicted_confidence, undyed_reference_rgb (same-frame baseline), observed_rgb, observed_method, observed_photo_path, lighting_note, status pending|observed|excluded.
- Trigger `du_enqueue_calibration_on_finish` on `jobs`: when `finished_disc_path` is set, a pending sample row is created automatically. No owner action.
- `public.du_record_calibration(...)` (service_role): upsert prediction and/or observation for a job region. Observed value moves status to observed.
- `public.du_srgb_to_lab`, `public.du_delta_e76`: CIE76 color difference in SQL. Checks: white vs black = 100.00, identical = 0.
- View `public.du_calibration_export` (service_role): observed samples with delta_e76 and delta_l (observed minus predicted lightness). This is the calibration export milestone.

## Use
When a job completes: the trigger queues a pending row; an operator step or later automation calls `du_record_calibration` with the predictor output at design time and the observed disc color sampled from the finished-disc photo next to the undyed reference. Photos stay private in storage; only RGB numbers are stored in the table.

## Rollback
`drop trigger du_enqueue_calibration_on_finish on public.jobs; drop view public.du_calibration_export; drop function public.du_record_calibration(uuid,text,text,text,text,text,text,jsonb,integer[],text,text,integer[],integer[],text,text,text); drop function public.du_delta_e76(integer[],integer[]); drop function public.du_srgb_to_lab(integer[]); alter table public.du_dye_calibration_samples rename to du_dye_calibration_samples_retired;` (rename, never drop data).

One self-test row (region_label selftest, status excluded) exists from verification.
