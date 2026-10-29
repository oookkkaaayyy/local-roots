# Owner local UV commissioning response v1.0.25

The v1.0.24 lock fix let the commissioning request reach the bounded on/off sequence, but the response handler then aborted the Nginx Lua request while internal AUX subrequests were pending. This release keeps the selected HTTP status and JSON response, and ends only the content handler with `ngx.exit(ngx.OK)`, so successful or error responses do not abort unfinished internal subrequests.

The release retains the exact installed v1.0.24 twenty-file rollback. It changes only the dedicated gateway's UV policy script, validates and reloads only the port 9443 gateway, and preserves output-off confirmation, the three-second single-channel cap, the unaccepted hardware profile, ordinary manual/follow gates, and Owner/origin protections.
