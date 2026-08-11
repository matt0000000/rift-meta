import { error } from '@sveltejs/kit';
import { championDetail, latestDay, TREND_DAYS } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const day = latestDay();
	if (!day) throw error(503, 'No snapshots collected yet');

	const detail = championDetail(params.slug, day);
	if (!detail) throw error(404, `Unknown champion "${params.slug}"`);

	return { ...detail, day, trendDays: TREND_DAYS };
};
