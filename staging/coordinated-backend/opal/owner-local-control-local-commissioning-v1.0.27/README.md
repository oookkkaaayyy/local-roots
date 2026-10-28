# Owner local UV response completion v1.0.27

This focused update makes the response helper only set the HTTP status and headers and write its JSON body. It returns no value, so the Lua content handler can finish normally without calling ngx.exit or returning a boolean. The three-second single-channel commissioning pulse, automatic OFF/readback, ordinary UV lock, and Owner/origin protections remain unchanged.

Before mutation, the installer verifies all 20 live files against this exact v1.0.26 rollback image.
