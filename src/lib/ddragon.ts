/** Riot Data Dragon helpers — official, free, no API key. Safe on both sides. */

export const DDRAGON = 'https://ddragon.leagueoflegends.com';

/**
 * Lolalytics slugs are the display name lowercased with non-letters stripped,
 * which diverges from Riot's internal id for a handful of champions
 * (e.g. "Wukong" -> `wukong`, where Riot's id is `MonkeyKing`).
 */
export function toSlug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function portraitUrl(version: string, championId: string): string {
	return `${DDRAGON}/cdn/${version}/img/champion/${championId}.png`;
}

export function splashUrl(championId: string): string {
	return `${DDRAGON}/cdn/img/champion/splash/${championId}_0.jpg`;
}
