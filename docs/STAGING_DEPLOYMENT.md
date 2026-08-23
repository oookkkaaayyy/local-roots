# Local Roots staging deployment

The application is designed for Cloudflare Pages with Git-backed deployments.

## Cloudflare Pages settings

- Repository: `oookkkaaayyy/local-roots`
- Production branch: `main`
- Root directory: `app`
- Framework preset: Vite (or None if Cloudflare auto-detects)
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: none required for the current Local Roots/Supabase connection

The browser configuration uses a Supabase **publishable** key, which Supabase explicitly classifies as safe for web pages and public source code. No secret/service-role key is present in the frontend.

## After the first deployment

1. Record the generated `https://<project>.pages.dev` origin.
2. Add that origin (and `https://<project>.pages.dev/admin/events`) to the Supabase Auth redirect allow-list before using the admin magic-link login.
3. Open `/events` and `/admin/events` for staging QA.
4. After the first authorized admin signs in, add that Auth user to `lr_admin_users` with role `admin`.

## Do not launch publicly yet

The first Pages deployment is staging only. Before launch:

- populate and validate real event data;
- test public submission -> review -> publish end to end;
- verify admin authorization and override release;
- verify mobile presentation and links;
- complete source-specific permission work before enabling third-party adapters;
- complete the launch-soak gates in `docs/ACCEPTANCE_TESTS.md`.
