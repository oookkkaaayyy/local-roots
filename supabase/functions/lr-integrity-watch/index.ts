import { createClient } from "npm:@supabase/supabase-js@2";
import { readFrontendGraph } from "./frontend-assets.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

const STAGING_URL = "https://local-roots.pages.dev/";
const REQUIRED_FRONTEND_MARKERS = [
  "Past events & results",
  "Upcoming events",
  "Add to Calendar",
  "PDGA Results",
  "On Local Roots",
  "Official link",
  "Full Results",
  "Submit organizer results",
  "lr_public_event_detail",
  "Clear filters",
  "Submit an event",
  "Hosted by",
  "TD:",
  "date-aware-v1",
  "/events/",
  "/dyed-and-unattached",
  "HB Night Flyers",
  "https://hbnightflyers.com/",
  "https://localrootsdg.com",
];
const REQUIRED_CSS_MARKERS = [
  ".event-title-link{",
  ".event-detail-card{",
  ".event-view-switch{",
  ".results-submit-disclosure{",
  ".result-division{",
  ".public-brand-shell.site-header",
  ".public-brand-shell.site-headernav",
  ".public-brand-shell.button.primary",
];

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_configuration" }, 500);

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = req.headers.get("x-local-roots-sync-secret") ?? "";
  const verified = await service.rpc("lr_verify_integrity_sync_secret", { p_token: token });
  if (verified.error || verified.data !== true) return json({ error: "unauthorized" }, 401);

  const readiness = await service.rpc("lr_launch_readiness");
  if (readiness.error || !readiness.data) {
    console.error("lr-integrity-watch readiness", readiness.error?.message);
    return json({ error: "readiness_failed" }, 500);
  }

  let stagingStatus: number | null = null;
  let shellOk = false;
  let stagingNoindexOk = false;
  let stagingSecurityHeadersOk = false;
  let stagingRobotsTag: string | null = null;
  let stagingFrameOptions: string | null = null;
  let stagingHsts: string | null = null;
  let frontendBundleOk = false;
  let frontendBundleUrl: string | null = null;
  let frontendAssetUrls: string[] = [];
  let missingFrontendMarkers = [...REQUIRED_FRONTEND_MARKERS];
  let cssBundleOk = false;
  let cssBundleUrl: string | null = null;
  let missingCssMarkers = [...REQUIRED_CSS_MARKERS];

  try {
    const response = await fetch(STAGING_URL, {
      headers: { "User-Agent": "LocalRootsIntegrityWatch/10.0" },
      redirect: "follow",
    });
    stagingStatus = response.status;
    stagingRobotsTag = response.headers.get("x-robots-tag");
    stagingFrameOptions = response.headers.get("x-frame-options");
    stagingHsts = response.headers.get("strict-transport-security");
    stagingNoindexOk = (stagingRobotsTag ?? "").toLowerCase().includes("noindex");
    stagingSecurityHeadersOk = stagingFrameOptions?.toUpperCase() === "DENY"
      && response.headers.get("x-content-type-options")?.toLowerCase() === "nosniff"
      && (response.headers.get("referrer-policy") ?? "").toLowerCase() === "strict-origin-when-cross-origin"
      && (stagingHsts ?? "").toLowerCase().includes("max-age=31536000");

    const body = await response.text();
    shellOk = response.status === 200
      && body.includes('<div id="root"></div>')
      && body.includes('<title>Local Roots · Southern California Disc Golf</title>');

    const scriptMatch = body.match(/<script[^>]+src=["']([^"']+\.js)["']/i);
    if (shellOk && scriptMatch?.[1]) {
      frontendBundleUrl = new URL(scriptMatch[1], STAGING_URL).toString();
      try {
        const graph = await readFrontendGraph(frontendBundleUrl, (url, init) => fetch(url, {
          ...init,
          headers: { "User-Agent": "LocalRootsIntegrityWatch/10.0" },
        }), new URL(STAGING_URL).origin);
        frontendAssetUrls = graph.urls;
        missingFrontendMarkers = REQUIRED_FRONTEND_MARKERS.filter((marker) => !graph.bundle.includes(marker));
        frontendBundleOk = missingFrontendMarkers.length === 0;
      } catch (error) {
        console.error("lr-integrity-watch frontend assets", error instanceof Error ? error.message : String(error));
      }
    }

    const cssMatch = body.match(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/i);
    if (shellOk && cssMatch?.[1]) {
      cssBundleUrl = new URL(cssMatch[1], STAGING_URL).toString();
      const cssResponse = await fetch(cssBundleUrl, {
        headers: { "User-Agent": "LocalRootsIntegrityWatch/10.0" },
        redirect: "follow",
      });
      if (cssResponse.ok) {
        const normalizedCss = (await cssResponse.text()).replace(/\s+/g, "");
        missingCssMarkers = REQUIRED_CSS_MARKERS.filter((marker) => !normalizedCss.includes(marker));
        cssBundleOk = missingCssMarkers.length === 0;
      }
    }
  } catch (error) {
    console.error("lr-integrity-watch staging", error instanceof Error ? error.message : String(error));
  }

  const stagingOk = shellOk && stagingNoindexOk && stagingSecurityHeadersOk && frontendBundleOk && cssBundleOk;
  const state = readiness.data as Record<string, unknown>;
  const recorded = await service.rpc("lr_record_integrity_snapshot", {
    p_public_events: Number(state.public_event_count ?? 0),
    p_published_without_provenance: Number(state.published_without_provenance ?? 0),
    p_sanctioned_without_basis: Number(state.sanctioned_without_basis ?? 0),
    p_staging_http_status: stagingStatus,
    p_staging_ok: stagingOk,
  });
  if (recorded.error) {
    console.error("lr-integrity-watch record", recorded.error.message);
    return json({ error: "record_failed" }, 500);
  }

  return json({
    ok: true,
    staging_http_status: stagingStatus,
    shell_ok: shellOk,
    staging_noindex_ok: stagingNoindexOk,
    staging_security_headers_ok: stagingSecurityHeadersOk,
    staging_robots_tag: stagingRobotsTag,
    staging_frame_options: stagingFrameOptions,
    staging_hsts: stagingHsts,
    frontend_bundle_ok: frontendBundleOk,
    frontend_bundle_url: frontendBundleUrl,
    frontend_asset_urls: frontendAssetUrls,
    missing_frontend_markers: missingFrontendMarkers,
    css_bundle_ok: cssBundleOk,
    css_bundle_url: cssBundleUrl,
    missing_css_markers: missingCssMarkers,
    staging_ok: stagingOk,
    integrity: recorded.data,
  });
});
