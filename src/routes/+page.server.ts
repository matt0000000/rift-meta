import { error } from '@sveltejs/kit';
import { laneBoard, latestDay, availableDays, TREND_DAYS } from '$lib/server/queries';
import { isLane, type Lane } from '$lib/lanes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const requested = url.searchParams.get('lane');
	const lane: Lane = isLane(requested) ? requested : 'top';

	const day = latestDay();
	if (!day) {
		// Nothing scraped yet — render an empty state rather than a 500.
		return { lane, day: null, rows: [], days: [], trendDays: TREND_DAYS };
	}

	const rows = laneBoard(lane, day);
	if (!rows.length) throw error(404, `No data for ${lane} on ${day}`);

	return { lane, day, rows, days: availableDays(), trendDays: TREND_DAYS };
};
