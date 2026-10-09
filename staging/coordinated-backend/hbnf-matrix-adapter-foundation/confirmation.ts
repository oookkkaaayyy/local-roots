/** Transport presence is not application confirmation; only hbnf-cart-relay may create a confirmed observation. */
export function confirmationContract() {
 return {transportConfirmed:false,transportObservation:"not_used",masterUnityObserved:false,commandApplicationConfirmed:false,status:"pending_relay"} as const;
}
