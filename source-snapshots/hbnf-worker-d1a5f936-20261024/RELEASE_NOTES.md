# HBNF calculated-Net reporting correction

This release changes only `public/skins.html` from the exact live production source served by Worker version `dfde63fe-685c-44f8-a230-9481caa3c3a3` (the live asset readback matched after removing Cloudflare’s injected challenge script).

Payout, scoring, tags, ace balances, and Supabase data remain unchanged. Net now reflects opponent-funded transfers less the player’s stakes on lost skins and the ace contribution; the page labels this as calculated net and says actual cash collection is not tracked.

The immediately prior Worker version is preserved as the rollback target.
