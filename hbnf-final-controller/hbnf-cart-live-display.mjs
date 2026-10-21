export function formatAcePotDisplay(live) {
  const value = Number(live?.acePot);
  if (live?.event === "skins") {
    return Number.isSafeInteger(value) && value >= 0
      ? `ACE POOL ${value} ENTRIES`
      : "ACE POOL UNAVAILABLE";
  }
  if (live?.event === "glow") {
    return Number.isFinite(value) && value >= 0
      ? `ACE POT $${value.toFixed(0)}`
      : "ACE POT UNAVAILABLE";
  }
  return "ACE VALUE UNAVAILABLE";
}
