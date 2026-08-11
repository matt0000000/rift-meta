import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';

/** Static champion metadata, refreshed from Riot Data Dragon. */
export const champions = sqliteTable('champions', {
	/** Riot's canonical key, e.g. "MonkeyKing". Stable across renames. */
	id: text('id').primaryKey(),
	/** Lolalytics url slug, e.g. "wukong". How we join scraped rows back. */
	slug: text('slug').notNull(),
	name: text('name').notNull(),
	title: text('title').notNull(),
	/** Data Dragon patch the portrait belongs to, e.g. "16.15.1". */
	version: text('version').notNull()
});

/**
 * One row per champion / lane / day. This is the whole product: a daily
 * snapshot of a rolling 7-day Emerald+ world sample, so day-over-day deltas
 * actually move instead of being damped by a patch-long cumulative average.
 */
export const snapshots = sqliteTable(
	'snapshots',
	{
		/** UTC date of the scrape, "YYYY-MM-DD". */
		day: text('day').notNull(),
		championId: text('champion_id')
			.notNull()
			.references(() => champions.id),
		/** top | jungle | middle | bottom | support */
		lane: text('lane').notNull(),
		winRate: real('win_rate').notNull(),
		pickRate: real('pick_rate').notNull(),
		banRate: real('ban_rate').notNull(),
		/** Share of this champion's games that were played in this lane. */
		laneShare: real('lane_share').notNull(),
		games: integer('games').notNull(),
		/** Game patch the sample came from, e.g. "16.15". */
		patch: text('patch').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.day, t.championId, t.lane] }),
		index('snapshots_lane_day').on(t.lane, t.day),
		index('snapshots_champ_lane').on(t.championId, t.lane)
	]
);

export type Champion = typeof champions.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
