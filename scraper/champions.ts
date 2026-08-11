/** Champion metadata from Riot's Data Dragon — official, free, no key required. */
import { DDRAGON, toSlug } from '../src/lib/ddragon';

export interface DdragonChampion {
	id: string; // "MonkeyKing"
	slug: string; // "wukong" — how Lolalytics addresses it
	name: string; // "Wukong"
	title: string;
	version: string;
}

export async function latestVersion(): Promise<string> {
	const res = await fetch(`${DDRAGON}/api/versions.json`);
	if (!res.ok) throw new Error(`Data Dragon versions: ${res.status}`);
	return (await res.json())[0];
}

/**
 * Data Dragon sometimes ships alternate entries alongside the real champion —
 * 16.15.1 carried 60 `Jade_*` duplicates for an event, gone again by 16.16.1.
 * They reuse the display name, so `toSlug` collapses them onto the canonical
 * champion's slug and the slug stops identifying a single row. Canonical
 * champion ids are plain alphanumeric CamelCase ("MonkeyKing", "KogMaw");
 * the variants carry an underscore-separated prefix, so that is the tell.
 */
function canonical(a: DdragonChampion, b: DdragonChampion): DdragonChampion {
	const rank = (c: DdragonChampion) => (c.id.includes('_') ? 1 : 0);
	if (rank(a) !== rank(b)) return rank(a) < rank(b) ? a : b;
	// Same shape: pick deterministically so a rerun can't flip the mapping.
	return a.id <= b.id ? a : b;
}

export async function fetchChampions(version: string): Promise<DdragonChampion[]> {
	const res = await fetch(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`);
	if (!res.ok) throw new Error(`Data Dragon champions: ${res.status}`);
	const { data } = (await res.json()) as {
		data: Record<string, { id: string; name: string; title: string }>;
	};

	const bySlug = new Map<string, DdragonChampion>();
	for (const c of Object.values(data)) {
		const champ: DdragonChampion = {
			id: c.id,
			slug: toSlug(c.name),
			name: c.name,
			title: c.title,
			version
		};
		const prev = bySlug.get(champ.slug);
		bySlug.set(champ.slug, prev ? canonical(champ, prev) : champ);
	}
	return [...bySlug.values()];
}

export { toSlug };
