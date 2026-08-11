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

export async function fetchChampions(version: string): Promise<DdragonChampion[]> {
	const res = await fetch(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`);
	if (!res.ok) throw new Error(`Data Dragon champions: ${res.status}`);
	const { data } = (await res.json()) as {
		data: Record<string, { id: string; name: string; title: string }>;
	};
	return Object.values(data).map((c) => ({
		id: c.id,
		slug: toSlug(c.name),
		name: c.name,
		title: c.title,
		version
	}));
}

export { toSlug };
