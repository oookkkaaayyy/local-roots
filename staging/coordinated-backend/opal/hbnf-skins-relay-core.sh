#!/bin/ash
# Shared validation/formatting helpers for the read-only Skins relay.

skins_jf() {
	jsonfilter -q -i "$1" -e "$2" 2>/dev/null | head -n 1
}

skins_target_matches() {
	[ "$1" = '704bca5b345c' ] && [ "$2" = 'hbnf-cart2-phase2-r6-vibe-first-ui-20261012' ]
}

skins_compact_entry() {
	local raw="$1" score name
	case "$raw" in *'"'*|*'\\'*) return 1;; esac
	case "$raw" in *' '*) ;; *) return 1;; esac
	score=${raw##* }
	name=${raw% *}
	case "$score" in ''|*[!0-9]*) return 1;; esac
	[ "${#score}" -le 4 ] || return 1
	[ "$score" -le 9999 ] 2>/dev/null || return 1
	# Match the installed renderer's five-character ASCII abbreviation rule.
	name="$(printf '%s' "$name" | LC_ALL=C tr -cd 'A-Za-z0-9 /.-' | LC_ALL=C tr '[:lower:]' '[:upper:]' | cut -c 1-5)"
	while [ "${name%${name#?}}" = ' ' ]; do name=${name#?}; done
	while [ -n "$name" ] && [ "${name#${name%?}}" = ' ' ]; do name=${name%?}; done
	[ -n "$name" ] || return 1
	printf '%s %s\n' "$name" "$score"
}

# Read a compact live_status response and emit a bounded hbnf-live-v1 snapshot.
# Fails closed until the staged front-lock selector version is deployed.
skins_build_snapshot() {
	local input="$1" marker active event label pot entry compact entries count
	marker="$(skins_jf "$input" '@.selectorVersion')"
	[ "$marker" = 'skins-front-lock-v1' ] || return 1
	active="$(skins_jf "$input" '@.live.active')"
	event="$(skins_jf "$input" '@.live.event')"
	label="$(skins_jf "$input" '@.live.label')"
	pot="$(skins_jf "$input" '@.live.acePot')"
	case "$active" in true|false) ;; *) return 1;; esac
	case "$pot" in ''|*[!0-9]*) [ "$active" = false ] && pot=0 || return 1;; esac
	[ "$pot" -le 9999 ] 2>/dev/null || return 1
	if [ "$active" != 'true' ] || [ "$event" != 'skins' ]; then
		printf '%s\n' '{"schema":"hbnf-live-v1","active":false,"label":"","acePot":0,"entries":[]}'
		return 0
	fi
	[ "$label" = 'F9' ] || [ "$label" = 'B9' ] || return 1
	entries="$(mktemp /tmp/hbnf-skins-entries.XXXXXX)" || return 1
	if ! jsonfilter -q -i "$input" -e '@.live.entries[*]' > "$entries" 2>/dev/null; then rm -f "$entries"; return 1; fi
	count=0
	{
		printf '{"schema":"hbnf-live-v1","active":true,"label":"%s","acePot":%s,"entries":[' "$label" "$pot"
		while IFS= read -r entry || [ -n "$entry" ]; do
			[ -n "$entry" ] || { rm -f "$entries"; return 1; }
			compact="$(skins_compact_entry "$entry")" || { rm -f "$entries"; return 1; }
			[ "$count" -lt 20 ] || { rm -f "$entries"; return 1; }
			[ "$count" -eq 0 ] || printf ','
			printf '"%s"' "$compact"
			count=$((count + 1))
		done < "$entries"
		printf ']}'
	} 
	rm -f "$entries"
	[ "$count" -gt 0 ]
}

skins_snapshot_changed() { [ "$1" != "$2" ]; }

skins_redisplay_due() {
	local last_display="$1" now="$2" last_success="$3" blocked="$4" interval="$5" freshness="$6"
	[ "$blocked" != 'true' ] || return 1
	[ $((now - last_success)) -le "$freshness" ] || return 1
	[ "$last_display" -eq 0 ] || [ $((now - last_display)) -ge "$interval" ]
}

skins_overlay_blocked() {
	local input="$1" overlay game
	overlay="$(skins_jf "$input" '@.state.HBNF.overlayId')"
	game="$(skins_jf "$input" '@.state.HBNF.gameActive')"
	[ -z "$overlay" ] || [ "$overlay" = 'null' ] || [ "$overlay" = 'false' ] || [ "$overlay" = '""' ] || return 0
	[ "$game" = 'true' ] && return 0
	return 1
}
