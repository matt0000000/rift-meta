/** Shared by the scraper, the server queries and the UI — no server-only imports. */

export const LANES = ['top', 'jungle', 'middle', 'bottom', 'support'] as const;
export type Lane = (typeof LANES)[number];

export const LANE_LABELS: Record<Lane, string> = {
	top: 'Top',
	jungle: 'Jungle',
	middle: 'Mid',
	bottom: 'ADC',
	support: 'Support'
};

export function isLane(value: string | null): value is Lane {
	return (LANES as readonly string[]).includes(value ?? '');
}
