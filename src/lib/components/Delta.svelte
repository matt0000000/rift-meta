<script lang="ts">
	/**
	 * Signed change over the trend window. Direction is carried by the glyph and
	 * the sign as well as the color, so it survives colorblindness and print —
	 * green/red alone would not.
	 */
	interface Props {
		value: number | null;
		/** Below this magnitude the move is noise, not a trend. */
		threshold?: number;
		digits?: number;
	}

	let { value, threshold = 0.05, digits = 2 }: Props = $props();

	let dir = $derived(
		value === null ? 'none' : value > threshold ? 'up' : value < -threshold ? 'down' : 'flat'
	);
</script>

{#if value === null}
	<span class="text-ink-3 text-xs">new</span>
{:else if dir === 'flat'}
	<span class="text-ink-3 nums text-xs" title="No meaningful change">–</span>
{:else}
	<span
		class={[
			'nums inline-flex items-center gap-0.5 text-xs font-medium',
			dir === 'up' && 'text-up',
			dir === 'down' && 'text-down'
		]}
	>
		<span aria-hidden="true">{dir === 'up' ? '▲' : '▼'}</span>
		<span>{value > 0 ? '+' : ''}{value.toFixed(digits)}</span>
	</span>
{/if}
