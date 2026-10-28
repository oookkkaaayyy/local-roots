# Owner local UV readback fix v1.0.28

After each fixed-segment WLED POST, the Opal handler now performs a separate internal GET of `/json/state` and validates the full AUX state. The POST response is only an acknowledgement; it is not treated as the state readback. This fixes commissioning tests that were immediately cleared as “unconfirmed” after a successful write. The bounded three-second pulse, guaranteed OFF attempt, OFF readback, UV hardware profile lock, and Owner/origin protections remain unchanged.

Before mutation, the installer verifies all 20 live Opal files against the exact freshly captured v1.0.27 image retained in this package and in Drive.
