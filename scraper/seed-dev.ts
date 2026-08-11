/**
 * DEV ONLY. Back-fills synthetic history so the trend charts have something to
 * draw before you've accumulated real days. It takes the most recent real
 * snapshot per champion/lane and random-walks it backwards.
 *
 * Never run this against the production database:
 *   DATABASE_URL=data/dev.db npm run seed:dev
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/server/db';
import { snapshots } from '../src/lib/server/db/schema';

const DAYS = Number(process.env.SEED_DAYS ?? 14);

const target = process.env.DATABASE_URL ?? 'data/stats.db';
if (!/dev|test/.test(target)) {
	console.error(`Refusing to seed "${target}" — point DATABASE_URL at a dev database.`);
	process.exit(1);
}

const latest = db
	.select({ day: sql<string>`max(${snapshots.day})` })
	.from(snapshots)
	.get()?.day;

if (!latest) {
	console.error('No real snapshots to extrapolate from. Run `npm run scrape` first.');
	process.exit(1);
}

const base = db.select().from(snapshots).where(sql`${snapshots.day} = ${latest}`).all();
const rows: (typeof snapshots.$inferInsert)[] = [];

for (const row of base) {
	let win = row.winRate;
	let pick = row.pickRate;
	let ban = row.banRate;
	for (let back = 1; back < DAYS; back++) {
		// Walk backwards from today with a gentle drift, so each champion gets a
		// direction that persists rather than pure noise.
		win += (Math.random() - 0.5) * 0.5;
		pick *= 1 + (Math.random() - 0.5) * 0.06;
		ban = Math.max(0, ban * (1 + (Math.random() - 0.5) * 0.08));
		const d = new Date(`${latest}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - back);
		rows.push({
			...row,
			day: d.toISOString().slice(0, 10),
			winRate: Math.round(win * 100) / 100,
			pickRate: Math.round(pick * 100) / 100,
			banRate: Math.round(ban * 100) / 100
		});
	}
}

for (let i = 0; i < rows.length; i += 200) {
	db.insert(snapshots).values(rows.slice(i, i + 200)).onConflictDoNothing().run();
}
console.log(`Seeded ${rows.length} synthetic rows across ${DAYS - 1} back-dated days in ${target}`);
