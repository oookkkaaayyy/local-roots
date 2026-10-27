const MAX_PAIRING_SECONDS = 180 * 24 * 60 * 60;

export async function readAuthoritativeDeviceExpiry(service, sessionHash, nowEpoch = Math.floor(Date.now() / 1000)) {
  if (typeof sessionHash !== "string" || !/^[0-9a-f]{64}$/.test(sessionHash)) return null;
  const { data, error } = await service.rpc("hbnf_cart_device_session_expiry", {
    p_session_hash: sessionHash,
  });
  if (error || !Number.isSafeInteger(data) || data <= nowEpoch || data > nowEpoch + MAX_PAIRING_SECONDS) return null;
  return data;
}
