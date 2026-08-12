<script lang="ts">
	/**
	 * The biggest win-rate movers in a lane — the site's premise, surfaced above
	 * the table instead of being left to a 72px sparkline in row 47.
	 *
	 * The row shape is declared structurally rather than imported from
	 * `$lib/server/queries`: this is a client component, and `$lib/server` is
	 * compile-enforced unreachable from one.
	 */
	import { resolve } from '$app/paths';
	import Delta from './Delta.svelte';
	import { portraitUrl } from '$lib/ddragon';

	interface Row {
		id: string;
		slug: string;
		name: string;
		version: string;
		pickRate: number;
		winDelta: number | null;
	}

	interface Props {
		rows: Row[];
		/** Days actually covered by the history, which early on is fewer than the
		 * nominal trend window. */
		spanDays: number;
		/** Minimum pick rate to qualify. */
		floor?: number;
		count?: number;
	}

	let { rows, spanDays, floor = 1, count = 5 }: Props = $props();

	// A 0.2% pick-rate champion swings several points on sampling noise alone, so
	// an unfiltered "biggest mover" list is just a list of rarely-played
	// champions. The floor is stated in the caption rather than hidden.
	let ranked = $derived(
		rows
			.filter((r) => r.winDelta !== null && r.pickRate >= floor)
			.toSorted((a, b) => b.winDelta! - a.winDelta!)
	);

	let rising = $derived(ranked.filter((r) => r.winDelta! > 0).slice(0, count));
	let falling = $derived(
		ranked
			.filter((r) => r.winDelta! < 0)
			.slice(-count)
			.toReversed()
	);

	let groups = $derived([
		{ key: 'up', title: 'Rising', list: rising },
		{ key: 'down', title: 'Falling', list: falling }
	]);
</script>

{#if rising.length || falling.length}
	<section class="mb-5" aria-label="Biggest win rate movers">
		<div class="mb-2 flex items-baseline gap-2">
			<h2 class="text-sm font-medium">Biggest movers</h2>
			<span class="text-ink-3 text-xs">
				win rate over {spanDays} {spanDays === 1 ? 'day' : 'days'} · above {floor}% pick
			</span>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			{#each groups as group (group.key)}
				<div class="rounded-lg border border-line bg-surface-1 p-3">
					<div class="text-ink-2 mb-2 text-xs font-medium">{group.title}</div>
					{#if group.list.length}
						<ul class="flex flex-col gap-1.5">
							{#each group.list as row, i (row.id)}
								<!-- Two stacked cards of five would push the table itself below the
								     fold on a phone, so the tail is trimmed rather than scrolled past. -->
								<li class={i >= 3 ? 'hidden sm:list-item' : undefined}>
									<a
										href={resolve('/champion/[slug]', { slug: row.slug })}
										class="hover:bg-surface-2 -mx-1.5 flex items-center gap-2 rounded px-1.5 py-1 transition-colors"
									>
										<img
											src={portraitUrl(row.version, row.id)}
											alt=""
											width="22"
											height="22"
											loading="lazy"
											class="rounded"
										/>
										<span class="truncate text-sm">{row.name}</span>
										<span class="ml-auto shrink-0"><Delta value={row.winDelta} /></span>
									</a>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-ink-3 py-1 text-xs">Nothing {group.title.toLowerCase()} yet.</p>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}
