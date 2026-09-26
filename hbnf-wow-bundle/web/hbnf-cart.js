import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0?bundle";

const SUPABASE_URL = "https://phcpbvuqibyarpfrftgx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jc_iBS62kG9OeUNVJalpZQ_-BR9ikSC";
const endpoint = `${SUPABASE_URL}/functions/v1/hbnf-cart-control`;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
window.hbnfSupabase = supabase;

let revision = 0;
const statusNode = document.querySelector("#status");
const authPanel = document.querySelector("#authPanel");
const authStatus = document.querySelector("#authStatus");
const authEmail = document.querySelector("#authEmail");

const outputMap = [["matrixBrightness", "matrixValue"], ["auxBrightness", "auxValue"]];
for (const [inputId, outputId] of outputMap) {
  document.getElementById(inputId).addEventListener("input", e => {
    document.getElementById(outputId).value = e.target.value;
  });
}

async function getSession({ showPanel = true } = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session ?? null;
  authPanel.hidden = !!session;
  if (!session && showPanel) throw new Error("Sign in to use cart controls.");
  return session;
}

async function call(body) {
  const session = await getSession();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

async function refresh() {
  const out = await call({ action: "status" });
  if (out.desired) {
    revision = out.desired.revision;
    const s = out.desired.state;
    for (const [device, input] of [["matrix", "matrixBrightness"], ["aux", "auxBrightness"]]) {
      if (Number.isFinite(s.devices?.[device]?.brightness)) {
        document.getElementById(input).value = s.devices[device].brightness;
        document.getElementById(input.replace("Brightness", "Value")).value = s.devices[device].brightness;
      }
    }
  }
  statusNode.textContent = out.desired
    ? `Desired revision ${revision} · ${out.desired.state.power.toUpperCase()} · ${out.observed.map(x => `${x.device_id}: ${x.status}`).join(" · ")}`
    : "Cart is not initialized; no control was sent.";
}

async function command(type, payload = {}) {
  const commandId = crypto.randomUUID();
  const result = await call({ action: "command", commandId, type, payload, expectedRevision: revision });
  revision = result.revision;
  statusNode.textContent = `Revision ${revision} accepted · reconciliation ${result.reconciliation?.status ?? "pending"}`;
  await refresh();
}

document.getElementById("sendMagicLink").addEventListener("click", async () => {
  const email = authEmail.value.trim();
  if (!email) {
    authStatus.textContent = "Enter your email.";
    return;
  }
  authStatus.textContent = "Sending sign-in link…";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: new URL("hbnf-cart.html", location.href).href },
  });
  authStatus.textContent = error ? `Sign-in failed: ${error.message}` : "Sign-in link sent. Open it on this device.";
});

supabase.auth.onAuthStateChange((_event, session) => {
  authPanel.hidden = !!session;
  if (session) {
    authStatus.textContent = "";
    refresh().catch(showError);
  }
});

document.querySelectorAll("[data-command]").forEach(button =>
  button.addEventListener("click", () => command(button.dataset.command).catch(showError))
);
document.getElementById("setScene").addEventListener("click", () =>
  command("SCENE", { sceneId: document.getElementById("scene").value }).catch(showError)
);
document.getElementById("setPalette").addEventListener("click", () =>
  command("PALETTE", { paletteId: document.getElementById("palette").value }).catch(showError)
);
document.getElementById("setVibe").addEventListener("click", () =>
  command("VIBE", { vibe: document.getElementById("vibe").value }).catch(showError)
);
document.getElementById("setSpeed").addEventListener("click", () =>
  command("SPEED", { speedBias: Number(document.getElementById("speed").value) }).catch(showError)
);
document.querySelectorAll("[data-brightness]").forEach(button =>
  button.addEventListener("click", () => {
    const deviceId = button.dataset.brightness;
    const brightness = Number(document.getElementById(`${deviceId}Brightness`).value);
    command("BRIGHTNESS", { deviceId, brightness }).catch(showError);
  })
);
document.getElementById("refresh").addEventListener("click", () => refresh().catch(showError));

function showError(error) {
  statusNode.textContent = `No change confirmed: ${error.message}`;
}

getSession({ showPanel: false })
  .then(session => {
    if (session) return refresh();
    authPanel.hidden = false;
    statusNode.textContent = "Sign in to connect to canonical cart control.";
  })
  .catch(showError);
