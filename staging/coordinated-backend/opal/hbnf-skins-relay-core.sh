#!/bin/ash
# Shared validation/formatting helpers for the read-only Skins relay.

skins_jf() {
	jsonfilter -q -i "$1" -e "$2" 2>/dev/null | head -n 1
}

skins_target_matches() {
	[ "$1" = '704bca5b345c' ] || return 1
	case "$2" in
		hbnf-cart2-phase2-r6-vibe-first-ui-20261012|hbnf-cart2-phase2-r6-skins-readable-20261014) return 0 ;;
		*) return 1 ;;
	esac
}

skins_full_entry() {
	local raw="$1" score name
	case "$raw" in *'"'*|*'\\'*) return 1;; esac
	case "$raw" in *' '*) ;; *) return 1;; esac
	score=${raw##* }
	name=${raw% *}
	case "$score" in ''|*[!0-9]*) return 1;; esac
	[ "${#score}" -le 4 ] || return 1
	[ "$score" -le 9999 ] 2>/dev/null || return 1
	# Preserve the complete name; the Matrix scrolls overflow deliberately.
	# Reject unsupported bytes rather than silently shortening or changing identity.
	[ "${#name}" -le 58 ] || return 1
	local clean_name
	clean_name="$(printf '%s' "$name" | LC_ALL=C tr -cd "A-Za-z0-9 /.'?$-")"
	[ "$clean_name" = "$name" ] || return 1
	[ -n "$name" ] || return 1
	printf '%s %s\n' "$name" "$score"
}

# Convert the source roster to labels that fit the installed renderer's 32 px
# static line (eight characters in its 4 px font). Keep roster order and fail
# closed if any label cannot be made unique without scrolling.
skins_compact_entries() {
	local input="$1" phase="$2"
	awk -v phase="$phase" '
	function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
	function firstword(s, a, n) { n=split(trim(s), a, /[ \t]+/); return a[1] }
	function letters(s) { gsub(/[^A-Za-z0-9]/, "", s); return toupper(s) }
	function ordinal(n, chars) { chars="123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; return substr(chars,n,1) }
	{
		line=$0; score=line; sub(/^.* /, "", score)
		name=line; sub(/ [0-9]+$/, "", name)
		if (score !~ /^[0-9]$/ || name == "") { bad=1; next }
		n=NR; scores[n]=score; names[n]=name
		if (phase == "F9") {
			first[n]=substr(letters(firstword(name)),1,3)
			if (first[n] == "") { bad=1; next }
			label[n]=substr(first[n],1,3)
		} else if (phase == "B9") {
			if (split(name, pair, /[\/]/) != 2) { bad=1; next }
			left=trim(pair[1]); right=trim(pair[2])
			first[n]=letters(firstword(left)); second[n]=letters(firstword(right))
			if (first[n] == "" || second[n] == "") { bad=1; next }
			leftLabel[n]=substr(first[n],1,1); rightLabel[n]=substr(second[n],1,1)
		} else { bad=1; next }
	}
	END {
		if (bad || NR == 0) exit 1
		if (phase == "F9") {
			for (i=1; i<=NR; i++) seen[first[i]]++
			for (i=1; i<=NR; i++) {
				if (seen[first[i]] > 1) {
					occurrence=0
					for (j=1; j<=i; j++) if (first[j] == first[i]) occurrence++
					if (occurrence > 35) exit 1
					label[i]=first[i] ordinal(occurrence)
				}
				out=label[i] " " scores[i]
				if (length(out) > 8) exit 1
				for (j=1; j<i; j++) if (label[i] == label[j]) exit 1
				print out
			}
		} else {
			for (i=1; i<=NR; i++) if (leftLabel[i] == rightLabel[i]) rightLabel[i]=rightLabel[i] "2"
			for (i=1; i<=NR; i++) { baseLeft[i]=leftLabel[i]; baseRight[i]=rightLabel[i]; seen[baseLeft[i] SUBSEP baseRight[i]]++ }
			for (i=1; i<=NR; i++) {
				key=baseLeft[i] SUBSEP baseRight[i]
				if (seen[key] > 1) {
					occurrence=0
					for (j=1; j<=i; j++) if (baseLeft[j] == baseLeft[i] && baseRight[j] == baseRight[i]) occurrence++
					if (occurrence > 35) exit 1
					leftLabel[i]=baseLeft[i] ordinal(occurrence)
				}
				out=leftLabel[i] " / " rightLabel[i] " " scores[i]
				if (length(out) > 8 || leftLabel[i] == rightLabel[i]) exit 1
				for (j=1; j<i; j++) if (leftLabel[i] == leftLabel[j] && rightLabel[i] == rightLabel[j]) exit 1
				print out
			}
		}
	}' "$input"
}

# Read a compact live_status response and emit a bounded hbnf-live-v1 snapshot.
# Fails closed until the staged front-lock selector version is deployed.
skins_build_snapshot() {
	local input="$1" marker active event label pot entry full entries compact count
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
	: > "$entries.validated"
	while IFS= read -r entry || [ -n "$entry" ]; do
		[ -n "$entry" ] || { rm -f "$entries" "$entries.validated"; return 1; }
		full="$(skins_full_entry "$entry")" || { rm -f "$entries" "$entries.validated"; return 1; }
		[ "$count" -lt 20 ] || { rm -f "$entries" "$entries.validated"; return 1; }
		printf '%s\n' "$full" >> "$entries.validated"
		count=$((count + 1))
	done < "$entries"
	[ "$count" -gt 0 ] || { rm -f "$entries" "$entries.validated"; return 1; }
	compact="$(skins_compact_entries "$entries.validated" "$label")" || { rm -f "$entries" "$entries.validated"; return 1; }
	rm -f "$entries" "$entries.validated"
	{
		printf '{"schema":"hbnf-live-v1","active":true,"label":"%s","acePot":%s,"entries":[' "$label" "$pot"
		count=0
		while IFS= read -r entry || [ -n "$entry" ]; do
			[ "$count" -eq 0 ] || printf ','
			printf '"%s"' "$entry"
			count=$((count + 1))
		done <<EOF
$compact
EOF
		printf ']}'
	}
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
