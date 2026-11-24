# MANDATORY FIRST STEP (all AI clients)
Before any plan, build, status claim or change, read the private repo oookkkaaayyy/hbnf-site folder PROJECT_MEMORY: START_HERE.md, OWNER_RULES.md, LEDGER.md, DECISIONS.md, INVENTORY.md, BACKLOG.md, and follow START_HERE.md. Never call anything missing or not done without searching it and the live systems. Never rebuild anything LEDGER marks done. Before ending a session, update LEDGER.md, DECISIONS.md and SESSION_LOG.md there. This repo is public: never put secrets or business-private details here.


## UI layout guard (mandatory for any visible change)
Run the shared Playwright layout guard from the public hbnf-site repo (scripts/layout_guard) against the branch preview before merging: `node scripts/layout_guard/guard.mjs --site lr --base-url https://<branch>.local-roots.pages.dev/`. It must report 0 failures (text overlaps, clipped text, content outside its panel, horizontal scroll, tap targets under 40px, controls closer than 4px, text under 11px, contrast under 4.5:1, broken images, console errors). Put structural fixes in the shared CSS (end of app/src/skin.css), not per page.


## Chat length and handoff (mandatory)
Apply PROJECT_MEMORY/HANDOFF_PROTOCOL.md (private repo oookkkaaayyy/hbnf-site) in every chat. When the chat is long (compaction, large transcript, major checkpoint), do the handoff audit yourself, pass the cold-start test, then tell Andrew `Handoff ready. Start a new chat now.` with the new-chat prompt. Also read PROJECT_MEMORY/handoffs/NEXT_SESSION.md and WHERE_THINGS_ARE.md at session start. This repo is public: never put secrets or business-private details here.
