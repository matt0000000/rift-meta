import { chromium, type Browser, type Page } from 'playwright';
import type { Lane } from '../src/lib/lanes';

const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export interface ScrapedRow {
	slug: string;
	name: string;
	laneShare: number;
	winRate: number;
	pickRate: number;
	banRate: number;
	games: number;
}

export interface LaneScrape {
	lane: Lane;
	rows: ScrapedRow[];
}

/**
 * Lolalytics tier-list rows are a flat flex div of exactly 15 cells:
 *   0 rank | 1 icon | 2 name | 3 tier (unused) | 4 lane% | 5 win% (+delta below)
 *   6 pick% | 7 ban% | 8 PBI | 9 games | 10..14 "Best Worldwide on Champion"
 * The trailing five are deliberately ignored — they describe one-trick
 * outliers on the champion, not the meta.
 */
const ROW_EXTRACTOR = () => {
	const num = (s: string) => Number(s.replace(/[,%+]/g, '').trim());
	const rows: unknown[] = [];

	for (const el of document.querySelectorAll('div')) {
		const cells = el.children;
		if (cells.length !== 15) continue;
		const link = el.querySelector('a[href^="/lol/"][href*="/build/"]');
		if (!link) continue;

		const text = (i: number) => (cells[i] as HTMLElement).innerText.trim();
		const slug = link.getAttribute('href')!.split('/')[2];
		const name = text(2).split('\n')[0];
		// Cell 5 stacks the win rate over its patch-on-patch delta; take line one.
		const values = [num(text(4)), num(text(5).split('\n')[0]), num(text(6)), num(text(7)), num(text(9))];
		if (values.some((v) => !Number.isFinite(v))) continue;
		const [laneShare, winRate, pickRate, banRate, games] = values;
		if (!slug || !name) continue;

		rows.push({ slug, name, laneShare, winRate, pickRate, banRate, games });
	}
	return rows as ScrapedRow[];
};

const hasRows = () =>
	[...document.querySelectorAll('div')].some(
		(d) => d.children.length === 15 && d.querySelector('a[href*="/build/"]')
	);

async function scrapeLane(page: Page, lane: Lane, days: number): Promise<LaneScrape> {
	// No `queue` param: Ranked Solo/Duo is already the default and passing it 404s.
	const url =
		`https://lolalytics.com/lol/tierlist/?lane=${lane}&tier=emerald_plus&region=all&patch=${days}`;

	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
	// The table is client-rendered; wait for real rows rather than a fixed sleep.
	await page.waitForFunction(hasRows, null, { timeout: 60_000 });

	// The list is virtualised — only ~20 rows exist in the DOM at any moment.
	// Walk down the page and merge each viewport's worth of rows by slug.
	const collected = new Map<string, ScrapedRow>();
	let lastHeight = -1;
	let idleScrolls = 0;

	for (let step = 0; step < 80; step++) {
		for (const row of await page.evaluate(ROW_EXTRACTOR)) collected.set(row.slug, row);

		const { scrolled, height } = await page.evaluate(() => {
			const before = window.scrollY;
			window.scrollBy(0, Math.round(window.innerHeight * 0.7));
			return { scrolled: window.scrollY > before, height: document.body.scrollHeight };
		});
		await page.waitForTimeout(350); // let the virtualiser paint the next window

		// Stop once we're at the bottom and the page has stopped growing.
		if (!scrolled && height === lastHeight) {
			if (++idleScrolls >= 2) break;
		} else {
			idleScrolls = 0;
		}
		lastHeight = height;
	}

	const rows = [...collected.values()];
	if (rows.length < 40) {
		throw new Error(`${lane}: only ${rows.length} rows parsed — layout probably changed`);
	}
	return { lane, rows };
}

/**
 * Scrapes every lane in one browser session.
 * `days` is the rolling sample window Lolalytics aggregates over (7 by default).
 */
export async function scrapeAllLanes(lanes: readonly Lane[], days = 7): Promise<LaneScrape[]> {
	let browser: Browser | undefined;
	try {
		browser = await chromium.launch();
		const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1000 } });

		// tsx/esbuild compiles with keepNames, which wraps inner functions in a
		// `__name(...)` helper. That helper doesn't exist inside the page, so any
		// serialised evaluate() callback throws. Shim it as identity.
		await ctx.addInitScript({ content: 'globalThis.__name ??= (fn) => fn;' });

		// Block everything we don't need. Cuts page weight ~90% and keeps the
		// scraper off third-party ad and tracking hosts entirely.
		await ctx.route('**/*', (route) => {
			const req = route.request();
			if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) return route.abort();
			if (!/(^|\.)lolalytics\.com$/.test(new URL(req.url()).hostname)) return route.abort();
			return route.continue();
		});

		const page = await ctx.newPage();
		const out: LaneScrape[] = [];
		for (const lane of lanes) {
			out.push(await scrapeLane(page, lane, days));
			await page.waitForTimeout(2000 + Math.random() * 2000); // be a polite guest
		}
		return out;
	} finally {
		await browser?.close();
	}
}
