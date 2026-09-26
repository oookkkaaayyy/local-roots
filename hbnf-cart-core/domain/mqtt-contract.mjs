export const MQTT = Object.freeze({
  namespace: "hbnf/cart/v2",
  retainedDesired: "hbnf/cart/v2/desired",
  observed: "hbnf/cart/v2/observed",
  availability: "hbnf/cart/v2/availability",
  command: "hbnf/cart/v2/command",
  commandAck: "hbnf/cart/v2/command-ack",
  audioSemantic: "hbnf/cart/v2/music/semantic",
  matrixAdapter: "hbnf/cart/v2/device/matrix/desired",
  matrixObserved: "hbnf/cart/v2/device/matrix/observed",
  auxAdapter: "hbnf/cart/v2/device/aux/desired",
  auxObserved: "hbnf/cart/v2/device/aux/observed",
});

export function validateEnvelope(message, { requireDevice = false } = {}) {
  if (!message || typeof message !== "object" || Array.isArray(message)) throw new TypeError("Message must be a JSON object.");
  if (message.schemaVersion !== 1 || typeof message.cartId !== "string" || !message.cartId.trim()) throw new TypeError("Missing cart identity/schema version.");
  if (requireDevice && !["matrix", "aux"].includes(message.deviceId)) throw new TypeError("Unknown adapter device.");
  if (message.cartRevision !== undefined && (!Number.isSafeInteger(message.cartRevision) || message.cartRevision < 0)) throw new TypeError("Invalid cartRevision.");
  if (message.fenceEpoch !== undefined && (!Number.isSafeInteger(message.fenceEpoch) || message.fenceEpoch < 1)) throw new TypeError("Invalid fenceEpoch.");
  return true;
}
