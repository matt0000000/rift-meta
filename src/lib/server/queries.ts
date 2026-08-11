import { and, eq, gte, inArray, sql, desc } from 'drizzle-orm';
import { db } from './db';
import { champions, snapshots } from './db/schema';
import type { Lane } from '$lib/lanes';

/** How many days of history feed the sparklines and the trend arrows. */
export const TREND_DAYS = 14;

export interface TrendPoint {
	day: string;
	winRate: number;
	pickRate: number;
	banRate: number;
}

export interface ChampionRow {
	id: string;
	name: string;
	title: string;
	slug: string;
	version: string;
	winRate: number;
	pickRate: number;
	banRate: number;
	games: number;
	/** Change over the trend window. `null` until there are ≥2 days of history. */
	winDelta: number | null;
	pickDelta: number | null;
	banDelta: number | null;
	history: TrendPoint[];
}

/** The most recent day we have any data for. */
export function latestDay(): string | null {
	const row = db
		.select({ day: sql<string>`max(${snapshots.day})` })
		.from(snapshots)
		.get();
	return row?.day ?? null;
}

export function availableDays(): string[] {
	return db
		.selectDistinct({ day: snapshots.day })
		.from(snapshots)
		.orderBy(desc(snapshots.day))
		.all()
		.map((r) => r.day);
}

function windowStart(day: string, days: number): string {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - (days - 1));
	return d.toISOString().slice(0, 10);
}

/**
 * The lane leaderboard: current numbers plus the history behind each row.
 *
 * Two queries rather than a window-function join — at ~100 champions × 14 days
 * this is a few thousand rows, and grouping in JS keeps the SQL legible.
 */
export function laneBoard(lane: Lane, day: string, trendDays = TREND_DAYS): ChampionRow[] {
	const since = windowStart(day, trendDays);

	const current = db
		.select({
			id: champions.id,
			name: champions.name,
			title: champions.title,
			slug: champions.slug,
			version: champions.version,
			winRate: snapshots.winRate,
			pickRate: snapshots.pickRate,
			banRate: snapshots.banRate,
			games: snapshots.games
		})
		.from(snapshots)
		.innerJoin(champions, eq(champions.id, snapshots.championId))
		.where(and(eq(snapshots.lane, lane), eq(snapshots.day, day)))
		.all();

	const history = db
		.select({
			championId: snapshots.championId,
			day: snapshots.day,
			winRate: snapshots.winRate,
			pickRate: snapshots.pickRate,
			banRate: snapshots.banRate
		})
		.from(snapshots)
		.where(and(eq(snapshots.lane, lane), gte(snapshots.day, since)))
		.orderBy(snapshots.day)
		.all();

	const byChampion = new Map<string, TrendPoint[]>();
	for (const h of history) {
		let series = byChampion.get(h.championId);
		if (!series) byChampion.set(h.championId, (series = []));
		series.push({ day: h.day, winRate: h.winRate, pickRate: h.pickRate, banRate: h.banRate });
	}

	return current
		.map((c) => {
			const series = byChampion.get(c.id) ?? [];
			const first = series[0];
			const last = series.at(-1);
			const hasSpan = series.length >= 2 && first && last;
			return {
				...c,
				history: series,
				winDelta: hasSpan ? last.winRate - first.winRate : null,
				pickDelta: hasSpan ? last.pickRate - first.pickRate : null,
				banDelta: hasSpan ? last.banRate - first.banRate : null
			};
		})
		.sort((a, b) => b.winRate - a.winRate);
}

export interface ChampionDetail {
	champion: typeof champions.$inferSelect;
	lanes: {
		lane: Lane;
		current: TrendPoint & { games: number; laneShare: number };
		history: TrendPoint[];
	}[];
}

export function championDetail(slug: string, day: string, trendDays = TREND_DAYS): ChampionDetail | null {
	// A slug should identify exactly one champion, and the ingest now guarantees
	// that. It has not always: Data Dragon briefly shipped `Jade_*` duplicates
	// sharing a display name, and picking the wrong one of the pair rendered an
	// empty page for a champion that plainly had data. Resolve against the
	// snapshots rather than trusting row order, so a future collision degrades
	// into "right numbers" instead of "no games recorded".
	const candidates = db.select().from(champions).where(eq(champions.slug, slug)).all();
	if (!candidates.length) return null;

	const since = windowStart(day, trendDays);
	const rows = db
		.select()
		.from(snapshots)
		.where(
			and(
				inArray(
					snapshots.championId,
					candidates.map((c) => c.id)
				),
				gte(snapshots.day, since)
			)
		)
		.orderBy(snapshots.day)
		.all();

	// Whichever candidate carries the data wins; ties fall back to row order.
	const counts = new Map<string, number>();
	for (const r of rows) counts.set(r.championId, (counts.get(r.championId) ?? 0) + 1);
	const champion =
		candidates.find((c) => counts.get(c.id) === Math.max(...counts.values())) ?? candidates[0];

	const byLane = new Map<string, typeof rows>();
	for (const r of rows.filter((r) => r.championId === champion.id)) {
		let list = byLane.get(r.lane);
		if (!list) byLane.set(r.lane, (list = []));
		list.push(r);
	}

	const lanes = [...byLane.entries()]
		.map(([lane, list]) => {
			const last = list.at(-1)!;
			return {
				lane: lane as Lane,
				current: {
					day: last.day,
					winRate: last.winRate,
					pickRate: last.pickRate,
					banRate: last.banRate,
					games: last.games,
					laneShare: last.laneShare
				},
				history: list.map((r) => ({
					day: r.day,
					winRate: r.winRate,
					pickRate: r.pickRate,
					banRate: r.banRate
				}))
			};
		})
		// Lead with the lane the champion is actually played in.
		.sort((a, b) => b.current.laneShare - a.current.laneShare);

	return { champion, lanes };
}
