#!/bin/sh
# Replaces the launchd calendar job inside the container.
#
# A long-lived sleep loop rather than cron: there is no cron in the image, the
# schedule is a single daily job, and this way the container's own logs are the
# scrape's logs. `date -d` arithmetic is GNU coreutils, present in the Debian
# base.
set -eu

: "${SCRAPE_AT:=06:15}"

run_scrape() {
	echo "[$(date -Is)] scrape starting"
	# tsx is invoked through node directly for the same reason launchd needed it:
	# a shebang resolved via PATH is one more thing that can differ per runtime.
	if node node_modules/tsx/dist/cli.mjs scraper/run.ts; then
		echo "[$(date -Is)] scrape ok"
	else
		# A failed scrape must not kill the container: the next day's attempt is
		# the retry, and restarting would just re-run it immediately.
		echo "[$(date -Is)] scrape FAILED (exit $?) — will retry at next ${SCRAPE_AT}" >&2
	fi
}

# Catch-up on start, mirroring RunAtLoad in the launchd agent. Snapshots upsert
# on (day, champion, lane), so a run on an already-collected day is a no-op.
run_scrape

while true; do
	now=$(date +%s)
	next=$(date -d "today ${SCRAPE_AT}" +%s)
	[ "$next" -le "$now" ] && next=$(date -d "tomorrow ${SCRAPE_AT}" +%s)
	echo "[$(date -Is)] next scrape at $(date -d "@${next}" -Is)"
	sleep $((next - now))
	run_scrape
done
