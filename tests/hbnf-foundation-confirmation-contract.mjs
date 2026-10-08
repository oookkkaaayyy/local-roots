import assert from "node:assert/strict";
import { confirmationContract } from "../staging/coordinated-backend/hbnf-matrix-adapter-foundation/confirmation.ts";

assert.deepEqual(confirmationContract(true, 255), {
  transportConfirmed: true,
  transportObservation: "mqtt-online-observed",
  masterUnityObserved: true,
  commandApplicationConfirmed: false,
});

assert.deepEqual(confirmationContract(true, 127), {
  transportConfirmed: true,
  transportObservation: "mqtt-online-observed",
  masterUnityObserved: false,
  commandApplicationConfirmed: false,
});

assert.deepEqual(confirmationContract(false, null), {
  transportConfirmed: false,
  transportObservation: "mqtt-online-not-observed",
  masterUnityObserved: false,
  commandApplicationConfirmed: false,
});

console.log("HBNF Foundation confirmation contract: PASS");
