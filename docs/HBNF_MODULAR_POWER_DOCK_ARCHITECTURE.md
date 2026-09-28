# HBNF modular electronics + one-switch power architecture

Status: staged architecture only. Do not alter the current accepted/troubleshooting Matrix/AUX firmware line from this branch.

## Goal
Make the HBNF electronics transferable between the Rogue Iron cart and a future wagon with minimal setup:
- no repeated plugging of multiple USB power-bank leads;
- one physical MASTER ON/OFF action for cart electronics;
- one rugged vehicle-lighting harness connection;
- no cloud/internet dependency for local operation;
- vehicle-specific LED strips/harnesses remain installed on each chassis.

## Mechanical architecture

### Electronics box
Use the current large TICONN enclosure as the removable electronics/power module if final wheel/door-clearance test passes.

Do not rely on hook-and-loop or adhesive as primary retention. The loaded enclosure may eventually contain a battery and therefore must be frame-supported.

### Carrier + receiver
1. Attach the enclosure to a rigid carrier plate using its external wall-mount brackets where practical, avoiding unnecessary penetrations through the IP67 shell.
2. Cart and wagon each receive an identical receiver geometry.
3. Receiver carries module weight on a lower aluminum angle/shelf.
4. Two over-center draw latches pull the carrier tightly against locating pads/stops.
5. Thin rubber/neoprene pads remove rattle.
6. Add a passive safety tether/secondary retention point.
7. Cart receiver should anchor to structural frame/post locations, not only the thin body panel.
8. Use a spacer/backer with clearance pockets/holes for existing bolt heads; do not force the enclosure shell to sit on bolt heads.

The result should be tool-less removal after releasing two latches and unplugging the vehicle harness.

## Modularity boundary

Do not make every chassis carry duplicate controllers.
- Transfer module: battery/power distribution, master switch, regulators, Opal, GameBridge, Matrix/AUX controllers, relay/control electronics.
- Vehicle permanent: underglow + UV strips and short harness to one docking connector.
- Matrix/iPad can be transferable display/control components with standardized quick mounts. Prefer separate quick mounts over making the entire box+display+iPad one awkward rigid monolith.

## Vehicle connector
Use a sealed keyed automotive connector at the repeated docking interface rather than LED-strip clip connectors.
Preferred family: TE/DEUTSCH DT.
- 6-pin class is suitable for 12V underglow power/ground/data plus 5V UV power/return and one spare, subject to measured current and final pin allocation.
- Do not route a potentially high-current 5V Matrix feed through this vehicle connector if the Matrix transfers with the module.
- Physically key/label voltage domains so 5V and 12V loads cannot be cross-connected.
- Existing strip clip/corner connectors remain strip-level connections, not the repeated chassis docking connector.

## Long-term power architecture

### Do not build the final system around six independent USB power-bank outputs
The current INIU P51L-E2 is useful as a portable source, but its official multi-output behavior collapses combined output to 5V/3A (15W) when more than one output is used. Multiple independent power banks also create wake/sleep, USB-PD/QC negotiation, and multi-plug setup dependencies.

### Preferred source
One central 12.8V LiFePO4 battery in the removable module, final capacity selected after a measured realistic-load test. Initial design range: roughly 15-20Ah if size/weight fit and measured energy use supports it.

Power path:
BATTERY -> main fuse -> physical DC-rated MASTER switch -> fused distribution.

Each downstream branch gets its own appropriately sized fuse.

Suggested rails:
- 12V native branch: AUX / 12V underglow.
- 5V LED branch: Matrix + UV as appropriate, using a properly rated DC-DC regulator and existing firmware current limits.
- 5V logic branch: Opal + GameBridge + iPad charge/control electronics. Keep logic separate from LED load transients to reduce resets/noise.

Final converter and fuse sizes must come from measured branch load, cable gauge, and device ratings rather than guessed maxima.

## One-switch behavior

MASTER OFF:
- removes DC power from every cart electronics branch downstream of the battery;
- iPad may remain asleep on its own internal battery, but its charger is off;
- charge port may remain directly connected to the battery through its own fuse so the module can charge while MASTER is OFF.

MASTER ON:
1. energizes all fused rails;
2. Opal boots;
3. Matrix/AUX/GameBridge boot locally;
4. iPad receives charging power;
5. firmware loads a known low-brightness, course-safe boot preset/state;
6. controller UI reports READY only after actual device confirmation.

No digital switch is required for normal startup. Digital OFF remains available for convenience, but the physical MASTER is the authoritative all-system power control.

## Charging
Provide one externally accessible, protected charge connector appropriate to the selected battery/charger. Charging should not require opening the enclosure or unplugging individual loads.

## Thermal acceptance
Before sealing final layout:
- closed-lid stationary soak under worst realistic course load;
- closed-lid game/router soak;
- verify battery, regulators, router and wiring remain within their manufacturer temperature limits.
Use the internal mounting plate as a heat spreader where appropriate. Add a membrane vent/thermal mitigation only if measured temperatures require it.

## Required acceptance
- loaded box has no tire contact through cart tilt/rock/wheel motion;
- enclosure door opens fully;
- two-latch receiver shows no rattle or release under cart vibration;
- module can move cart -> wagon without tools;
- one vehicle harness connector mates cleanly;
- MASTER ON cold boots entire system without touching individual power banks/buttons;
- MASTER OFF removes all external load power;
- five consecutive cold boots;
- router absent fallback still works;
- full-course-duration energy/runtime test with reserve.
