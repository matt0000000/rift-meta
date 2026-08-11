<script lang="ts">
	import TrendChart from '$lib/components/TrendChart.svelte';
	import Delta from '$lib/components/Delta.svelte';
	import { LANE_LABELS } from '$lib/lanes';
	import { portraitUrl } from '$lib/ddragon';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let selected = $state(0);
	let active = $derived(data.lanes[selected] ?? data.lanes[0]);

	function delta(values: number[]): number | null {
		return values.length >= 2 ? values.at(-1)! - values[0] : null;
	}

	let winSeries = $derived(active?.history.map((h) => ({ day: h.day, value: h.winRate })) ?? []);
	let pickSeries = $derived(active?.history.map((h) => ({ day: h.day, value: h.pickRate })) ?? []);
</script>

<svelte:head>
	<title>{data.champion.name} stats · Rift Meta</title>
	<meta
		name="description"
		content="{data.champion.name} Emerald+ win rate and pick rate trends by role."
	/>
</svelte:head>

<a href="/" class="text-ink-2 hover:text-ink mb-4 inline-block text-sm">← All champions</a>

<div class="mb-6 flex items-center gap-4">
	<img
		src={portraitUrl(data.champion.version, data.champion.id)}
		alt=""
		width="64"
		height="64"
		class="rounded-lg"
	/>
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">{data.champion.name}</h1>
		<p class="text-ink-2 text-sm">{data.champion.title}</p>
	</div>
</div>

{#if !data.lanes.length}
	<p class="text-ink-2 rounded-lg border border-line bg-surface-1 p-8 text-center text-sm">
		No recent games recorded for this champion in the Emerald+ sample.
	</p>
{:else}
	{#if data.lanes.length > 1}
		<nav class="mb-4 flex gap-1 rounded-lg bg-surface-1 p-1" aria-label="Role">
			{#each data.lanes as l, i (l.lane)}
				<button
					onclick={() => (selected = i)}
					aria-current={i === selected ? 'true' : undefined}
					class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {i === selected
						? 'bg-surface-2 text-ink'
						: 'text-ink-2 hover:text-ink'}"
				>
					{LANE_LABELS[l.lane]}
					<span class="text-ink-3 ml-1 text-xs">{l.current.laneShare.toFixed(0)}%</span>
				</button>
			{/each}
		</nav>
	{/if}

	<!-- Hero numbers first: the headline needs no chart. -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each [{ label: 'Win rate', value: active.current.winRate, d: delta(active.history.map((h) => h.winRate)) }, { label: 'Pick rate', value: active.current.pickRate, d: delta(active.history.map((h) => h.pickRate)) }, { label: 'Ban rate', value: active.current.banRate, d: null }] as stat (stat.label)}
			<div class="rounded-lg border border-line bg-surface-1 p-3">
				<div class="text-ink-2 text-xs">{stat.label}</div>
				<div class="nums mt-0.5 text-xl font-semibold">{stat.value.toFixed(2)}%</div>
				{#if stat.d !== null}
					<div class="mt-0.5"><Delta value={stat.d} /></div>
				{/if}
			</div>
		{/each}
		<div class="rounded-lg border border-line bg-surface-1 p-3">
			<div class="text-ink-2 text-xs">Games</div>
			<div class="nums mt-0.5 text-xl font-semibold">{active.current.games.toLocaleString()}</div>
			{#if active.current.tier}
				<div class="text-ink-3 mt-0.5 text-xs">Tier {active.current.tier}</div>
			{/if}
		</div>
	</div>

	<!--
		Two measures on different scales get two charts, never one with two y-axes.
	-->
	<div class="grid gap-6 lg:grid-cols-2">
		<div class="rounded-lg border border-line bg-surface-1 p-4">
			<TrendChart points={winSeries} color="var(--color-win)" title="Win rate" />
		</div>
		<div class="rounded-lg border border-line bg-surface-1 p-4">
			<TrendChart points={pickSeries} color="var(--color-pick)" title="Pick rate" />
		</div>
	</div>

	<!-- The table view: every plotted value available as text. -->
	<details class="mt-6">
		<summary class="text-ink-2 hover:text-ink cursor-pointer text-sm">Show data table</summary>
		<div class="mt-3 overflow-x-auto rounded-lg border border-line">
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="bg-surface-1 text-ink-2 text-left text-xs">
						<th scope="col" class="px-3 py-2 font-medium">Date</th>
						<th scope="col" class="px-3 py-2 text-right font-medium">Win rate</th>
						<th scope="col" class="px-3 py-2 text-right font-medium">Pick rate</th>
					</tr>
				</thead>
				<tbody>
					{#each active.history.toReversed() as h (h.day)}
						<tr class="border-t border-line">
							<td class="nums px-3 py-1.5">{h.day}</td>
							<td class="nums px-3 py-1.5 text-right">{h.winRate.toFixed(2)}%</td>
							<td class="nums px-3 py-1.5 text-right">{h.pickRate.toFixed(2)}%</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
{/if}
