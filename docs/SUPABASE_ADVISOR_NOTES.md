# Supabase Advisor Notes

## 2026-08-23

Pre-existing D&U performance findings repaired:
- added covering indexes for `gallery_items.job_id` and `job_photos.job_id`;
- changed the `job_files` service-role RLS expression to init-plan-safe form;
- replaced overlapping `gallery_items` authenticated SELECT policies with non-overlapping role/action policies.

Current remaining advisor notices are informational only:
- `unused_index` notices are expected while the D&U and Local Roots tables are empty/new;
- `rls_enabled_no_policy` notices on private Local Roots tables are intentional deny-by-default behavior. Public Local Roots event reading occurs only through the restricted public surface established in Milestone 1.

Do not remove new indexes solely because the advisor marks them unused before production traffic exists.
