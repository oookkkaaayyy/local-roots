const endpoint = "/functions/v1/hbnf-cart-control";
let revision = 0;
let token = null;
const statusNode = document.querySelector("#status");
const outputMap = [["matrixBrightness", "matrixValue"], ["auxBrightness", "auxValue"]];
for (const [inputId, outputId] of outputMap) document.getElementById(inputId).addEventListener("input", e => document.getElementById(outputId).value = e.target.value);

async function call(body) {
  token ??= await getAccessToken();
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}
async function refresh() {
  const out = await call({ action: "status" });
  if (out.desired) { revision = out.desired.revision; const s = out.desired.state; for (const [device,input] of [["matrix","matrixBrightness"],["aux","auxBrightness"]]) { if (Number.isFinite(s.devices?.[device]?.brightness)) { document.getElementById(input).value = s.devices[device].brightness; document.getElementById(input.replace("Brightness","Value")).value = s.devices[device].brightness; } } }
  statusNode.textContent = out.desired ? `Desired revision ${revision} · ${out.desired.state.power.toUpperCase()} · ${out.observed.map(x => `${x.device_id}: ${x.status}`).join(" · ")}` : "Cart is not initialized; no control was sent.";
}
async function command(type, payload = {}) {
  const commandId = crypto.randomUUID();
  const result = await call({ action: "command", commandId, type, payload, expectedRevision: revision });
  revision = result.revision;
  statusNode.textContent = `Revision ${revision} accepted · reconciliation ${result.reconciliation?.status ?? "pending"}`;
  await refresh();
}
async function getAccessToken() {
  // Host page must establish a logged-in Supabase session; token is read from the live client only.
  const client = window.hbnfSupabase;
  if (!client?.auth?.getSession) throw new Error("Authenticated HBNF session is required.");
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in to use cart controls.");
  return data.session.access_token;
}
document.querySelectorAll("[data-command]").forEach(button => button.addEventListener("click", () => command(button.dataset.command).catch(showError)));
document.getElementById("setScene").addEventListener("click", () => command("SCENE", { sceneId: document.getElementById("scene").value }).catch(showError));
document.getElementById("setPalette").addEventListener("click", () => command("PALETTE", { paletteId: document.getElementById("palette").value }).catch(showError));
document.getElementById("setVibe").addEventListener("click", () => command("VIBE", { vibe: document.getElementById("vibe").value }).catch(showError));
document.getElementById("setSpeed").addEventListener("click", () => command("SPEED", { speedBias: Number(document.getElementById("speed").value) }).catch(showError));
document.querySelectorAll("[data-brightness]").forEach(button => button.addEventListener("click", () => { const deviceId = button.dataset.brightness; const brightness = Number(document.getElementById(`${deviceId}Brightness`).value); command("BRIGHTNESS", { deviceId, brightness }).catch(showError); }));
document.getElementById("refresh").addEventListener("click", () => refresh().catch(showError));
function showError(error) { statusNode.textContent = `No change confirmed: ${error.message}`; }
refresh().catch(showError);
