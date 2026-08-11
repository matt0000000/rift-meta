# Rift Meta

Daily win-rate and pick-rate tracking for every League of Legends champion, split
by role, in the spirit of Dota Plus: two numbers, a delta, and a trend line — and
nothing else competing for attention.

Sample: **Emerald+, world, Ranked Solo/Duo**, over a rolling 7-day window.

## How it works

A daily scrape stores one snapshot per champion / role / day. Because every day
is kept, the trend line is real history rather than a single "vs last patch"
figure — which is the thing Dota Plus gets right and most LoL stat sites don't.

```
Lolalytics (7-day rolling, Emerald+, world)  ──┐
                                               ├─► SQLite ─► SvelteKit ─► charts
Riot Data Dragon (names, portraits, patch)   ──┘
```

The sample window is deliberately rolling rather than patch-cumulative: a
cumulative average barely moves after the first few days of a patch, which
flattens exactly the day-to-day movement this site exists to show.

## Stack

| Piece | Choice | Why |
|---|---|---|
| App | SvelteKit 2 + Svelte 5 (runes) | Server-rendered tables, minimal client JS |
| Styling | Tailwind v4 | Theme tokens in `src/app.css` |
| Database | SQLite + Drizzle | The dataset is ~450 rows/day; this stays small for years |
| Scraper | Playwright (headless Chromium) | Lolalytics renders client-side and virtualises rows |
| Charts | Hand-rolled SVG | Two single-series charts don't justify a charting library |
| Deploy | `adapter-node` | Runs anywhere with a writable volume for the DB |

## Setup

```bash
npm install
npx playwright install chromium
npm run db:push       # create the schema
npm run scrape        # collect today's snapshot (~2 min)
npm run dev
```

Day one shows every trend as `new` — deltas and sparklines need at least two
days of history. To see the charts populated before then:

```bash
cp data/stats.db data/dev.db
DATABASE_URL=data/dev.db npm run seed:dev   # synthetic history, dev only
DATABASE_URL=data/dev.db npm run dev
```

`seed:dev` refuses to run unless `DATABASE_URL` contains `dev` or `test`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run scrape` | Collect one daily snapshot for all five roles |
| `npm run db:push` | Apply the Drizzle schema |
| `npm run seed:dev` | Back-fill synthetic history (dev databases only) |
| `npm run build` | Production build |

## Deploying locally (macOS)

`deploy/install.sh` builds the app and installs two launchd agents — the site,
and the daily scrape:

```bash
./deploy/install.sh              # port 3000, this machine only
./deploy/install.sh 8080         # or pick a port
./deploy/install.sh 3000 --lan   # also reachable from phones/other machines
```

That gives you `http://localhost:3000`, restarted automatically if it crashes or
after a reboot, plus a scrape at 06:15 local time. With `--lan` the installer
prints the address other devices should use, e.g. `http://192.168.1.141:3000`.

| Task | Command |
|---|---|
| Status | `launchctl list \| grep riftmeta` |
| Scrape right now | `launchctl kickstart -p gui/$UID/com.riftmeta.scrape` |
| Restart the site | `launchctl kickstart -k gui/$UID/com.riftmeta.web` |
| Logs | `tail -f logs/web.log logs/scrape.log` |
| Uninstall | `./deploy/install.sh --uninstall` |

After changing code, re-run `./deploy/install.sh` — it rebuilds and reloads both
agents so the running server never serves a stale bundle.

Notes:

- The server binds to `127.0.0.1` unless you pass `--lan`, which binds `0.0.0.0`.
  Your LAN address is assigned by DHCP and can change after a reboot or a router
  restart — `ipconfig getifaddr en0` gives the current one. Reserve a static
  lease in your router if you want the address to stick.
- There is no authentication. On a home network that's usually fine; on a shared
  or public network, anyone on it can reach the site. Don't port-forward it.
- If the agent shows a non-zero status and `logs/web.log` reports `EADDRINUSE`,
  something else already holds the port — `lsof -nP -iTCP:3000 -sTCP:LISTEN`
  names it. `KeepAlive` will retry forever until the port is free.
- `DATABASE_URL` is set to an absolute path in both agents; launchd doesn't
  guarantee a working directory, and a relative path would silently create a
  second, empty database.
- launchd jobs get a minimal `PATH`, which is why the scrape agent invokes
  `tsx/dist/cli.mjs` through `node` rather than relying on a shebang.
- If the Mac is asleep at 06:15 the run is deferred until it wakes. The scrape is
  idempotent, so a catch-up run just rewrites the same day.

## Running the daily scrape elsewhere

On Linux, or anywhere without launchd, the same job is a cron line. The scrape is
idempotent — snapshots upsert on `(day, champion, lane)` — so a retry after a
failure is safe.

```cron
# 06:15 daily
15 6 * * * cd /srv/rift-meta && /usr/bin/npm run scrape >> logs/scrape.log 2>&1
```

Configuration:

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `data/stats.db` | SQLite file path |
| `SAMPLE_WINDOW_DAYS` | `7` | Rolling window Lolalytics aggregates over |

The scraper loads five pages a day, blocks images/fonts/CSS and every non-
Lolalytics host, and pauses a few seconds between roles. If Lolalytics changes
its table markup the run fails loudly (`only N rows parsed`) and writes nothing,
rather than silently recording zeros.

## Design notes

- **Two measures, two charts.** Win rate and pick rate live on different scales,
  so they never share a y-axis.
- **Direction is never color alone.** Every delta carries a ▲/▼ glyph and a
  sign, so it survives colorblindness and print; the blue/orange series pair is
  validated for CVD separation against the dark surface.
- **Flat is flat.** Moves under 0.05pp render as `–` rather than as a trend.

## Attribution

Champion statistics are scraped from [Lolalytics](https://lolalytics.com);
champion names and portraits come from Riot's Data Dragon. This project isn't
endorsed by Riot Games or Lolalytics. If you deploy it publicly, keep the
attribution visible and check that your usage is acceptable to Lolalytics.
