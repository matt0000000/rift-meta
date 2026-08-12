import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? 'data/stats.db';

function connect(): BetterSQLite3Database<typeof schema> {
	// The directory is a runtime concern — under Docker it arrives as a mounted
	// volume, so it cannot be assumed to exist when this module is first loaded.
	mkdirSync(dirname(url), { recursive: true });

	const sqlite = new Database(url);
	sqlite.pragma('journal_mode = WAL');
	// Two processes share this file (the server reads while the scraper writes),
	// so a writer holding the lock should be waited out, not failed on.
	sqlite.pragma('busy_timeout = 5000');
	return drizzle(sqlite, { schema });
}

let instance: BetterSQLite3Database<typeof schema> | undefined;

/**
 * Connects on first query rather than on import. `vite build` imports every
 * server module to analyse routes, and an eager connection meant a build could
 * only run where a writable database already existed — it would even leave a
 * stray empty one behind. Proxying keeps the `db.select(...)` call sites
 * unchanged everywhere else.
 */
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
	get: (_, prop, receiver) => Reflect.get((instance ??= connect()), prop, receiver)
});

export { schema };
