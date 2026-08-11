/**
 * Daily ingest. Run once per day from cron:
 *   0 6 * * *  cd /srv/app && npm run scrape >> logs/scrape.log 2>&1
 *
 * Re-running on the same day is safe — snapshots upsert on (day, champion, lane).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/server/db';
import { champions, snapshots } from '../src/lib/server/db/schema';
import { LANES } from '../src/lib/lanes';
import { fetchChampions, latestVersion, toSlug } from './champions';
import { scrapeAllLanes } from './lolalytics';

const day = new Date().toISOString().slice(0, 10);
const WINDOW_DAYS = Number(process.env.SAMPLE_WINDOW_DAYS ?? 7);

async function main() {
	mkdirSync(dirname(process.env.DATABASE_URL ?? 'data/stats.db'), { recursive: true });

	const version = await latestVersion();
	const roster = await fetchChampions(version);
	console.log(`[${day}] Data Dragon ${version}: ${roster.length} champions`);

	db.insert(champions)
		.values(roster)
		.onConflictDoUpdate({
			target: champions.id,
			set: {
				slug: sql`excluded.slug`,
				name: sql`excluded.name`,
				title: sql`excluded.title`,
				version: sql`excluded.version`
			}
		})
		.run();

	// "16.15.1" -> "16.15". Data Dragon is a more reliable source for the live
	// patch than the tier-list page, which labels itself by the sample window.
	const patch = version.split('.').slice(0, 2).join('.');

	const bySlug = new Map(roster.map((c) => [c.slug, c]));
	const scrapes = await scrapeAllLanes(LANES, WINDOW_DAYS);

	const unmatched = new Set<string>();
	const rows = scrapes.flatMap(({ lane, rows }) =>
		rows.flatMap((r) => {
			// Prefer the slug, fall back to the display name Lolalytics rendered.
			const champ = bySlug.get(r.slug) ?? bySlug.get(toSlug(r.name));
			if (!champ) {
				unmatched.add(`${r.slug} (${r.name})`);
				return [];
			}
			return [
				{
					day,
					championId: champ.id,
					lane,
					winRate: r.winRate,
					pickRate: r.pickRate,
					banRate: r.banRate,
					laneShare: r.laneShare,
					games: r.games,
					tier: r.tier,
					patch
				}
			];
		})
	);

	if (unmatched.size) console.warn(`unmatched champions: ${[...unmatched].join(', ')}`);
	if (!rows.length) throw new Error('scrape produced zero usable rows — aborting without a write');

	// Chunked to stay under SQLite's variable limit on large inserts.
	for (let i = 0; i < rows.length; i += 200) {
		db.insert(snapshots)
			.values(rows.slice(i, i + 200))
			.onConflictDoUpdate({
				target: [snapshots.day, snapshots.championId, snapshots.lane],
				set: {
					winRate: sql`excluded.win_rate`,
					pickRate: sql`excluded.pick_rate`,
					banRate: sql`excluded.ban_rate`,
					laneShare: sql`excluded.lane_share`,
					games: sql`excluded.games`,
					tier: sql`excluded.tier`,
					patch: sql`excluded.patch`
				}
			})
			.run();
	}

	for (const s of scrapes) console.log(`  ${s.lane.padEnd(8)} ${s.rows.length} rows`);
	console.log(`[${day}] wrote ${rows.length} snapshots — patch ${patch}, ${WINDOW_DAYS}-day window`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
