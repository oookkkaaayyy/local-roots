# Owner local UV response completion v1.0.26

This focused update removes the Nginx Lua exit call from the response helper. The request now ends by returning normally from the content handler, avoiding the observed OpenResty error “attempt to abort with pending subrequests.” The existing three-second, one-channel commissioning pulse and automatic OFF/readback remain intact. Ordinary UV control stays locked until physical hardware-profile acceptance.

Before any change, the installer rehashes all 20 current managed files against this release’s exact admitted rollback baseline. It changes only the dedicated UV policy handler and uses its existing failure restore path.
