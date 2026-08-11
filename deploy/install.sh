#!/usr/bin/env bash
# Install Rift Meta as two launchd agents on macOS:
#   com.riftmeta.web     — the site, kept alive on http://localhost:$PORT
#   com.riftmeta.scrape  — the daily snapshot, at 06:15 local time
#
#   ./deploy/install.sh [port]        install / reinstall (loopback only)
#   ./deploy/install.sh [port] --lan  also serve the local network
#   ./deploy/install.sh --uninstall   remove both agents
set -euo pipefail

PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LABELS=(com.riftmeta.web com.riftmeta.scrape)

if [[ "${1:-}" == "--uninstall" ]]; then
	for label in "${LABELS[@]}"; do
		launchctl bootout "gui/$UID/$label" 2>/dev/null || true
		rm -f "$AGENTS/$label.plist"
		echo "removed $label"
	done
	exit 0
fi

PORT=3000
HOST=127.0.0.1
for arg in "$@"; do
	case "$arg" in
		--lan) HOST=0.0.0.0 ;;
		''|*[!0-9]*) echo "unrecognised argument: $arg" >&2; exit 1 ;;
		*) PORT="$arg" ;;
	esac
done

NODE="$(command -v node)"
[[ -n "$NODE" ]] || { echo "node not found on PATH" >&2; exit 1; }

# The address other devices will use; en0 is Wi-Fi on virtually all Macs.
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

echo "project : $PROJECT"
echo "node    : $NODE"
echo "port    : $PORT"
echo "bind    : $HOST"

mkdir -p "$PROJECT/logs" "$PROJECT/data" "$AGENTS"

# Build fresh so the agent never serves a stale bundle.
( cd "$PROJECT" && npm run build )

for label in "${LABELS[@]}"; do
	sed -e "s|__PROJECT__|$PROJECT|g" \
	    -e "s|__NODE__|$NODE|g" \
	    -e "s|__PORT__|$PORT|g" \
	    -e "s|__HOST__|$HOST|g" \
	    "$PROJECT/deploy/$label.plist" > "$AGENTS/$label.plist"

	# bootout first so a re-run reloads changed settings rather than erroring.
	# It returns before the job is actually gone, and bootstrapping into a
	# still-occupied slot fails with "Input/output error" — so wait it out.
	launchctl bootout "gui/$UID/$label" 2>/dev/null || true
	for _ in $(seq 1 50); do
		launchctl print "gui/$UID/$label" >/dev/null 2>&1 || break
		sleep 0.2
	done

	launchctl bootstrap "gui/$UID" "$AGENTS/$label.plist"
	echo "loaded $label"
done

echo
echo "Site      : http://localhost:$PORT"
if [[ "$HOST" == "0.0.0.0" ]]; then
	if [[ -n "$LAN_IP" ]]; then
		echo "On LAN    : http://$LAN_IP:$PORT"
	else
		echo "On LAN    : (no IPv4 address on en0/en1 — are you connected?)"
	fi
	echo "            macOS may prompt to allow incoming connections — accept it."
fi
echo "Logs      : $PROJECT/logs/{web,scrape}.log"
echo "Scrape now: launchctl kickstart -p gui/$UID/com.riftmeta.scrape"
echo "Uninstall : ./deploy/install.sh --uninstall"
