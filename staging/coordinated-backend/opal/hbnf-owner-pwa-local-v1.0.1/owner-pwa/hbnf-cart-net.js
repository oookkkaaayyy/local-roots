export const HBNF_API_TIMEOUT_MS = 8000;
export const HBNF_VISUAL_TIMEOUT_MS = 5000;

export function parsePairFragment(hash) {
  const source = String(hash || "");
  const match = source.match(/(?:^#|[&#])pair=([^&]+)/i);
  if (!match) return "";
  let token = "";
  try { token = decodeURIComponent(match[1]); } catch (_) { return ""; }
  return /^[a-f0-9]{64}$/i.test(token) ? token : "";
}

export async function fetchWithDeadline(fetchFn, url, options = {}, timeoutMs = HBNF_API_TIMEOUT_MS, label = "Cart request") {
  if (typeof fetchFn !== "function") throw new TypeError("fetch function required");
  const ms = Math.max(250, Number(timeoutMs) || HBNF_API_TIMEOUT_MS);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      const error = new Error(`${label} timed out`);
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });
  const requestOptions = controller ? { ...options, signal: controller.signal } : options;
  try {
    return await Promise.race([Promise.resolve().then(() => fetchFn(url, requestOptions)), timeout]);
  } catch (error) {
    if (error && error.name === "AbortError") {
      const timeoutError = new Error(`${label} timed out`);
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
