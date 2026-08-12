<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import Delta from '$lib/components/Delta.svelte';
	import Movers from '$lib/components/Movers.svelte';
	import { LANES, LANE_LABELS } from '$lib/lanes';
	import { portraitUrl } from '$lib/ddragon';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Each measure renders as value / delta / sparkline, in this order. */
	const measures = [
		{ key: 'winRate', delta: 'winDelta', label: 'Win rate', short: 'Win', color: 'var(--color-win)' },
		{ key: 'pickRate', delta: 'pickDelta', label: 'Pick rate', short: 'Pick', color: 'var(--color-pick)' },
		{ key: 'banRate', delta: 'banDelta', label: 'Ban rate', short: 'Ban', color: 'var(--color-ban)' }
	] as const;

	type SortKey = (typeof measures)[number]['key'] | (typeof measures)[number]['delta'];
	const SORT_KEYS = measures.flatMap((m) => [m.key, m.delta]) as SortKey[];

	const DEFAULTS = { sort: 'winRate' as SortKey, dir: 'desc' as 'asc' | 'desc', min: 0.5, q: '' };

	// Seeded from the URL so a shared link arrives with its sort and filters
	// intact, then written back on every change. Held as local state rather than
	// derived from `page.url` so the search field stays a plain uncontrolled
	// input — deriving it would round-trip every keystroke through the router.
	const params = page.url.searchParams;
	const asSort = (v: string | null): SortKey =>
		SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : DEFAULTS.sort;

	let sort = $state(asSort(params.get('sort')));
	let dir = $state<'asc' | 'desc'>(params.get('dir') === 'asc' ? 'asc' : 'desc');
	let minPick = $state(Number(params.get('min') ?? DEFAULTS.min) || 0);
	let q = $state(params.get('q') ?? '');
	/** Which measure the narrow layout shows; all three are visible from `md` up. */
	let measure = $state<(typeof measures)[number]['key']>('winRate');

	function query(overrides: Record<string, string | number | null> = {}) {
		const next = new URLSearchParams();
		const state: Record<string, string | number> = {
			lane: data.lane,
			sort,
			dir,
			min: minPick,
			q,
			...overrides
		};
		for (const [k, v] of Object.entries(state)) {
			const s = String(v);
			// Defaults are omitted so the common case stays a clean `?lane=top`.
			if (s === '' || s === String(DEFAULTS[k as keyof typeof DEFAULTS])) continue;
			next.set(k, s);
		}
		return `?${next}`;
	}

	function sync() {
		// replaceState, not goto: none of these affect the server load, and this
		// keeps the back button meaning "previous lane" rather than "previous
		// keystroke". Rewriting the search of the current URL preserves whatever
		// pathname (and base path) we are actually mounted at — svelte-autofixer
		// flags this for not calling resolve(), but it matches on a literal
		// resolve() argument and cloning the live URL is the stronger guarantee.
		const url = new URL(page.url);
		url.search = query();
		replaceState(url, page.state);
	}

	function sortBy(key: SortKey) {
		if (sort === key) dir = dir === 'desc' ? 'asc' : 'desc';
		else {
			sort = key;
			dir = 'desc';
		}
		sync();
	}

	let needle = $derived(q.trim().toLowerCase());

	let rows = $derived(
		data.rows
			.filter((r) => r.pickRate >= minPick && (!needle || r.name.toLowerCase().includes(needle)))
			.toSorted((a, b) => {
				// Champions without history sink to the bottom of a delta sort
				// rather than being treated as a zero move.
				const av = a[sort];
				const bv = b[sort];
				if (av === null) return 1;
				if (bv === null) return -1;
				return dir === 'asc' ? av - bv : bv - av;
			})
	);

	// The nominal window is 14 days; early on the history is shorter, and
	// labelling a 2-day change as a 14-day trend would misrepresent it.
	let spanDays = $derived(Math.max(1, ...data.rows.map((r) => r.history.length)));
	let deltaTitle = $derived(`Change over the last ${spanDays} ${spanDays === 1 ? 'day' : 'days'}`);

	let ariaSort = (key: SortKey) =>
		sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
</script>

<svelte:head>
	<title>{LANE_LABELS[data.lane]} champion stats · Rift Meta</title>
	<meta
		name="description"
		content="Daily Emerald+ win rate, pick rate and ban rate trends for every League of Legends champion, by role."
	/>
</svelte:head>

<!-- Filters sit in one row above the data, per the interaction spec. -->
<div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
	<nav class="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-surface-1 p-1" aria-label="Role">
		{#each LANES as lane (lane)}
			<a
				href="{resolve('/')}{query({ lane })}"
				data-sveltekit-noscroll
				aria-current={lane === data.lane ? 'page' : undefined}
				class={[
					'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
					lane === data.lane ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'
				]}
			>
				{LANE_LABELS[lane]}
			</a>
		{/each}
	</nav>

	<label class="relative">
		<span class="sr-only">Search champions</span>
		<input
			type="search"
			bind:value={q}
			oninput={sync}
			placeholder="Search champion…"
			autocomplete="off"
			class="border-line bg-surface-1 text-ink placeholder:text-ink-3 focus:border-ink-3 w-44 rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors"
		/>
	</label>

	<label class="text-ink-2 flex items-center gap-2 text-xs">
		Min pick rate
		<input
			type="range"
			min="0"
			max="5"
			step="0.25"
			bind:value={minPick}
			onchange={sync}
			class="accent-win w-24"
		/>
		<span class="nums text-ink w-9">{minPick.toFixed(2)}%</span>
	</label>

	{#if data.day}
		<span class="text-ink-3 text-xs sm:ml-auto">
			{data.day} · {rows.length} champions
		</span>
	{/if}
</div>

{#if !data.day}
	<div class="rounded-lg border border-line bg-surface-1 p-8 text-center">
		<p class="font-medium">No data yet</p>
		<p class="text-ink-2 mt-1 text-sm">Run <code class="text-ink">npm run scrape</code> to collect the first daily snapshot.</p>
	</div>
{:else}
	<Movers rows={data.rows} {spanDays} />

	<!--
		Narrow screens show one measure at a time: eleven columns on a phone is a
		horizontal-scroll experience, and this is a phone-in-champion-select site.
	-->
	<div class="mb-3 flex items-center gap-2 md:hidden">
		<span class="text-ink-2 text-xs">Show</span>
		<div class="flex gap-1 rounded-lg bg-surface-1 p-1">
			{#each measures as m (m.key)}
				<button
					onclick={() => (measure = m.key)}
					aria-pressed={measure === m.key}
					class={[
						'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
						measure === m.key ? 'bg-surface-2 text-ink' : 'text-ink-2'
					]}
				>
					{m.short}
				</button>
			{/each}
		</div>
	</div>

	{#if !rows.length}
		<div class="rounded-lg border border-line bg-surface-1 p-8 text-center">
			<p class="font-medium">No champions match</p>
			<p class="text-ink-2 mt-1 text-sm">
				{#if needle}Nothing named “{q}” in {LANE_LABELS[data.lane]}.{:else}Every champion in this role is below {minPick.toFixed(2)}% pick rate.{/if}
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-line">
			<table class="w-full border-collapse text-sm md:min-w-[940px]">
				<thead>
					<tr class="bg-surface-1 text-ink-2 text-left text-xs">
						<th scope="col" class="w-10 px-3 py-2.5 font-medium">#</th>
						<th scope="col" class="px-3 py-2.5 font-medium">Champion</th>
						{#each measures as m (m.key)}
							{@const shown = measure === m.key}
							<th
								scope="col"
								aria-sort={ariaSort(m.key)}
								class={['px-3 py-2.5 text-right font-medium', !shown && 'hidden md:table-cell']}
							>
								<button
									onclick={() => sortBy(m.key)}
									class="hover:text-ink transition-colors {sort === m.key ? 'text-ink' : ''}"
								>
									{m.label}{#if sort === m.key}<span aria-hidden="true" class="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>{/if}
								</button>
							</th>
							<th
								scope="col"
								aria-sort={ariaSort(m.delta)}
								class={['px-2 py-2.5 text-right font-medium', !shown && 'hidden md:table-cell']}
							>
								<button
									onclick={() => sortBy(m.delta)}
									class="hover:text-ink transition-colors {sort === m.delta ? 'text-ink' : ''}"
									title={deltaTitle}
								>
									Δ{#if sort === m.delta}<span aria-hidden="true" class="ml-0.5">{dir === 'asc' ? '▲' : '▼'}</span>{/if}
								</button>
							</th>
							<th
								scope="col"
								class={['w-20 px-2 py-2.5 font-medium', !shown && 'hidden md:table-cell']}
							>
								Trend
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row, i (row.id)}
						<tr class="border-t border-line hover:bg-surface-1">
							<td class="nums text-ink-3 px-3 py-2 text-xs">{i + 1}</td>
							<td class="px-3 py-2">
								<a
									href={resolve('/champion/[slug]', { slug: row.slug })}
									class="flex items-center gap-2.5 hover:underline"
								>
									<img
										src={portraitUrl(row.version, row.id)}
										alt=""
										width="28"
										height="28"
										loading="lazy"
										class="rounded"
									/>
									<span class="font-medium">{row.name}</span>
								</a>
							</td>

							{#each measures as m (m.key)}
								{@const shown = measure === m.key}
								<td
									class={[
										'nums px-3 py-2 text-right font-medium',
										!shown && 'hidden md:table-cell'
									]}
								>
									{row[m.key].toFixed(2)}%
								</td>
								<td class={['px-2 py-2 text-right', !shown && 'hidden md:table-cell']}>
									<Delta value={row[m.delta]} />
								</td>
								<td class={['px-2 py-2', !shown && 'hidden md:table-cell']}>
									<Sparkline
										values={row.history.map((h) => h[m.key])}
										color={m.color}
										label="{row.name} {m.label.toLowerCase()} over {spanDays} days"
									/>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}
