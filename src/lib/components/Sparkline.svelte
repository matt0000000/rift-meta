<script lang="ts">
	/**
	 * A bare trend line for use inside a table row. One series, no axes, no
	 * legend — the row already states the current value and its delta in text,
	 * so this carries shape only and never carries meaning by color alone.
	 */
	interface Props {
		values: number[];
		color: string;
		width?: number;
		height?: number;
		label?: string;
	}

	let { values, color, width = 72, height = 24, label = '' }: Props = $props();

	const PAD = 3;

	let path = $derived.by(() => {
		if (values.length < 2) return '';
		const min = Math.min(...values);
		const max = Math.max(...values);
		// A flat series would divide by zero; draw it down the middle instead.
		const span = max - min || 1;
		const stepX = (width - PAD * 2) / (values.length - 1);

		return values
			.map((v, i) => {
				const x = PAD + i * stepX;
				const y = PAD + (1 - (v - min) / span) * (height - PAD * 2);
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	});

	let last = $derived.by(() => {
		if (values.length < 2) return null;
		const min = Math.min(...values);
		const span = Math.max(...values) - min || 1;
		return {
			x: width - PAD,
			y: PAD + (1 - (values.at(-1)! - min) / span) * (height - PAD * 2)
		};
	});
</script>

{#if path}
	<svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label} class="block">
		<path d={path} fill="none" stroke={color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		{#if last}
			<!-- 2px surface ring keeps the head legible where the line doubles back -->
			<circle cx={last.x} cy={last.y} r="2.5" fill={color} stroke="var(--color-surface-1)" stroke-width="2" />
		{/if}
	</svg>
{:else}
	<div class="text-ink-3 text-[11px]" style="width:{width}px">—</div>
{/if}
