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

	// One template shared by the header and every row so the columns line up.
	// Written as a literal here because Tailwind scans source text for class
	// names — building it by concatenation would leave it ungenerated.
	const GRID =
		'md:grid-cols-[2.5rem_minmax(8rem,1fr)_repeat(3,4rem_3.5rem_4.5rem)] md:gap-x-2';

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
		The card layout has no column headers to click, so narrow screens get an
		explicit sort control instead.
	-->
	<div class="mb-3 flex items-center gap-2 md:hidden">
		<label class="text-ink-2 flex items-center gap-2 text-xs">
			Sort by
			<select
				value={sort}
				onchange={(e) => {
					sort = asSort(e.currentTarget.value);
					sync();
				}}
				class="border-line bg-surface-1 text-ink rounded-lg border px-2 py-1.5 text-xs outline-none"
			>
				{#each measures as m (m.key)}
					<option value={m.key}>{m.label}</option>
					<option value={m.delta}>{m.label} change</option>
				{/each}
			</select>
		</label>
		<button
			onclick={() => {
				dir = dir === 'desc' ? 'asc' : 'desc';
				sync();
			}}
			class="border-line bg-surface-1 text-ink-2 hover:text-ink rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
			aria-label={dir === 'desc' ? 'Sorted highest first' : 'Sorted lowest first'}
		>
			{dir === 'desc' ? '▼ High' : '▲ Low'}
		</button>
	</div>

	{#if !rows.length}
		<div class="rounded-lg border border-line bg-surface-1 p-8 text-center">
			<p class="font-medium">No champions match</p>
			<p class="text-ink-2 mt-1 text-sm">
				{#if needle}Nothing named “{q}” in {LANE_LABELS[data.lane]}.{:else}Every champion in this role is below {minPick.toFixed(2)}% pick rate.{/if}
			</p>
		</div>
	{:else}
		<!--
			One DOM for both layouts. Rendering a table for desktop and cards for
			phones meant every champion, and all three of its sparklines, was emitted
			twice — half of each response was markup the viewport would never show, and
			it grew with the trend window. Here each measure's three cells are wrapped
			for the card layout and the wrapper is dissolved with `md:contents`, so the
			same cells become real grid columns on desktop. The wrappers are
			`presentation` so the row still owns its cells for assistive tech.
		-->
		<div
			role="table"
			aria-label="{LANE_LABELS[data.lane]} champion statistics"
			class="flex flex-col gap-2 md:block md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-line"
		>
			<div
				role="row"
				class="text-ink-2 hidden bg-surface-1 px-3 py-2.5 text-xs md:grid {GRID}"
			>
				<span role="columnheader">#</span>
				<span role="columnheader">Champion</span>
				{#each measures as m (m.key)}
					<span role="columnheader" aria-sort={ariaSort(m.key)} class="text-right font-medium">
						<button
							onclick={() => sortBy(m.key)}
							class="hover:text-ink transition-colors {sort === m.key ? 'text-ink' : ''}"
						>
							{m.label}{#if sort === m.key}<span aria-hidden="true" class="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>{/if}
						</button>
					</span>
					<span role="columnheader" aria-sort={ariaSort(m.delta)} class="text-right font-medium">
						<button
							onclick={() => sortBy(m.delta)}
							class="hover:text-ink transition-colors {sort === m.delta ? 'text-ink' : ''}"
							title={deltaTitle}
						>
							Δ{#if sort === m.delta}<span aria-hidden="true" class="ml-0.5">{dir === 'asc' ? '▲' : '▼'}</span>{/if}
						</button>
					</span>
					<span role="columnheader" class="font-medium">Trend</span>
				{/each}
			</div>

			{#each rows as row, i (row.id)}
				<div
					role="row"
					class="rounded-lg border border-line bg-surface-1 p-3 md:items-center md:rounded-none md:border-0 md:border-t md:border-line md:bg-transparent md:px-3 md:py-2 md:hover:bg-surface-1 md:grid {GRID}"
				>
					<div role="presentation" class="mb-2 flex items-center gap-2.5 md:contents">
						<span role="cell" class="nums text-ink-3 text-xs">{i + 1}</span>
						<span role="cell">
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
								<span class="truncate font-medium">{row.name}</span>
							</a>
						</span>
					</div>

					{#each measures as m (m.key)}
						<div role="presentation" class="flex items-center gap-2 md:contents">
							<span class="text-ink-2 w-8 text-xs md:hidden" aria-hidden="true">{m.short}</span>
							<span role="cell" class="nums w-16 text-right text-sm font-medium md:w-auto">
								{row[m.key].toFixed(2)}%
							</span>
							<span role="cell" class="w-14 text-right md:w-auto"><Delta value={row[m.delta]} /></span>
							<span role="cell" class="ml-auto md:ml-0">
								<Sparkline
									values={row.history.map((h) => h[m.key])}
									color={m.color}
									label="{row.name} {m.label.toLowerCase()} over {spanDays} days"
								/>
							</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
{/if}
