/**
 * WLED's retained MQTT status is a liveness observation, not a correlated
 * acknowledgement that a particular Cart projection was applied.
 */
export function confirmationContract(online: boolean, masterBrightness: number | null) {
  return {
    transportConfirmed: online,
    transportObservation: online ? "mqtt-online-observed" : "mqtt-online-not-observed",
    masterUnityObserved: masterBrightness === 255,
    commandApplicationConfirmed: false,
  } as const;
}
