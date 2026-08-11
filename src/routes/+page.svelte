<script lang="ts">
	import Sparkline from '$lib/components/Sparkline.svelte';
	import Delta from '$lib/components/Delta.svelte';
	import { LANES, LANE_LABELS } from '$lib/lanes';
	import { portraitUrl } from '$lib/ddragon';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type SortKey = 'winRate' | 'pickRate' | 'winDelta' | 'pickDelta';
	let sort = $state<SortKey>('winRate');
	let minPick = $state(0.5);

	let rows = $derived(
		data.rows
			.filter((r) => r.pickRate >= minPick)
			.toSorted((a, b) => {
				// Champions without history sink to the bottom of a delta sort
				// rather than being treated as a zero move.
				const av = a[sort];
				const bv = b[sort];
				if (av === null) return 1;
				if (bv === null) return -1;
				return bv - av;
			})
	);

	const columns: { key: SortKey; label: string }[] = [
		{ key: 'winRate', label: 'Win rate' },
		{ key: 'pickRate', label: 'Pick rate' }
	];
</script>

<svelte:head>
	<title>{LANE_LABELS[data.lane]} tier list · Rift Meta</title>
	<meta
		name="description"
		content="Daily Emerald+ win rate and pick rate trends for every League of Legends champion, by role."
	/>
</svelte:head>

<!-- Filters sit in one row above the data, per the interaction spec. -->
<div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
	<nav class="flex gap-1 rounded-lg bg-surface-1 p-1" aria-label="Role">
		{#each LANES as lane (lane)}
			<a
				href="?lane={lane}"
				aria-current={lane === data.lane ? 'page' : undefined}
				class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {lane === data.lane
					? 'bg-surface-2 text-ink'
					: 'text-ink-2 hover:text-ink'}"
			>
				{LANE_LABELS[lane]}
			</a>
		{/each}
	</nav>

	<label class="text-ink-2 flex items-center gap-2 text-xs">
		Min pick rate
		<input
			type="range"
			min="0"
			max="5"
			step="0.25"
			bind:value={minPick}
			class="accent-win w-24"
		/>
		<span class="nums text-ink w-9">{minPick.toFixed(2)}%</span>
	</label>

	{#if data.day}
		<span class="text-ink-3 ml-auto text-xs">
			{data.day} · {data.trendDays}-day trend · {rows.length} champions
		</span>
	{/if}
</div>

{#if !data.day}
	<div class="rounded-lg border border-line bg-surface-1 p-8 text-center">
		<p class="font-medium">No data yet</p>
		<p class="text-ink-2 mt-1 text-sm">Run <code class="text-ink">npm run scrape</code> to collect the first daily snapshot.</p>
	</div>
{:else}
	<div class="overflow-x-auto rounded-lg border border-line">
		<table class="w-full min-w-[680px] border-collapse text-sm">
			<thead>
				<tr class="bg-surface-1 text-ink-2 text-left text-xs">
					<th scope="col" class="w-10 px-3 py-2.5 font-medium">#</th>
					<th scope="col" class="px-3 py-2.5 font-medium">Champion</th>
					{#each columns as col (col.key)}
						<th scope="col" class="px-3 py-2.5 text-right font-medium">
							<button
								onclick={() => (sort = col.key)}
								class="hover:text-ink transition-colors {sort === col.key ? 'text-ink' : ''}"
							>
								{col.label}
							</button>
						</th>
						<th scope="col" class="px-2 py-2.5 text-right font-medium">
							<button
								onclick={() => (sort = col.key === 'winRate' ? 'winDelta' : 'pickDelta')}
								class="hover:text-ink transition-colors {sort ===
								(col.key === 'winRate' ? 'winDelta' : 'pickDelta')
									? 'text-ink'
									: ''}"
								title="Change over the last {data.trendDays} days"
							>
								Δ
							</button>
						</th>
						<th scope="col" class="w-20 px-2 py-2.5 font-medium">Trend</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i (row.id)}
					<tr class="border-t border-line hover:bg-surface-1">
						<td class="nums text-ink-3 px-3 py-2 text-xs">{i + 1}</td>
						<td class="px-3 py-2">
							<a href="/champion/{row.slug}" class="flex items-center gap-2.5 hover:underline">
								<img
									src={portraitUrl(row.version, row.id)}
									alt=""
									width="28"
									height="28"
									loading="lazy"
									class="rounded"
								/>
								<span class="font-medium">{row.name}</span>
								{#if row.tier}
									<span class="text-ink-3 rounded bg-surface-2 px-1.5 py-0.5 text-[10px]">
										{row.tier}
									</span>
								{/if}
							</a>
						</td>

						<td class="nums px-3 py-2 text-right font-medium">{row.winRate.toFixed(2)}%</td>
						<td class="px-2 py-2 text-right"><Delta value={row.winDelta} /></td>
						<td class="px-2 py-2">
							<Sparkline
								values={row.history.map((h) => h.winRate)}
								color="var(--color-win)"
								label="{row.name} win rate over {data.trendDays} days"
							/>
						</td>

						<td class="nums px-3 py-2 text-right font-medium">{row.pickRate.toFixed(2)}%</td>
						<td class="px-2 py-2 text-right"><Delta value={row.pickDelta} /></td>
						<td class="px-2 py-2">
							<Sparkline
								values={row.history.map((h) => h.pickRate)}
								color="var(--color-pick)"
								label="{row.name} pick rate over {data.trendDays} days"
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
