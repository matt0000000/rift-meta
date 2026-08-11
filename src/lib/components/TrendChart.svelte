<script lang="ts">
	/**
	 * A single-series time chart with a crosshair + tooltip. One series means no
	 * legend is needed — the title names it — and no second y-axis exists to
	 * tempt a dual-scale overlay.
	 */
	interface Point {
		day: string;
		value: number;
	}

	interface Props {
		points: Point[];
		color: string;
		title: string;
		unit?: string;
		height?: number;
	}

	let { points, color, title, unit = '%', height = 160 }: Props = $props();

	const W = 560;
	const PAD = { top: 12, right: 14, bottom: 24, left: 44 };

	let plotW = $derived(W - PAD.left - PAD.right);
	let plotH = $derived(height - PAD.top - PAD.bottom);

	let scale = $derived.by(() => {
		const vals = points.map((p) => p.value);
		const lo = Math.min(...vals);
		const hi = Math.max(...vals);
		// Pad the domain so the line never rides the frame; keep a floor so a
		// near-flat series doesn't get magnified into fake drama.
		const pad = Math.max((hi - lo) * 0.25, 0.35);
		const min = lo - pad;
		const max = hi + pad;
		return {
			min,
			max,
			x: (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW),
			y: (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH
		};
	});

	let path = $derived(
		points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.x(i).toFixed(1)},${scale.y(p.value).toFixed(1)}`).join(' ')
	);

	let ticks = $derived([scale.max, (scale.max + scale.min) / 2, scale.min]);

	let hover = $state<number | null>(null);

	function onmove(event: PointerEvent) {
		const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * W;
		const t = (x - PAD.left) / plotW;
		hover = Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1))));
	}
</script>

<figure class="m-0">
	<figcaption class="mb-1 flex items-baseline gap-2">
		<span class="inline-block h-2 w-2 rounded-full" style="background:{color}"></span>
		<span class="text-sm font-medium">{title}</span>
		{#if hover !== null}
			<span class="nums text-ink-2 ml-auto text-xs">
				{points[hover].day} · <span class="text-ink font-medium">{points[hover].value.toFixed(2)}{unit}</span>
			</span>
		{/if}
	</figcaption>

	<svg
		viewBox="0 0 {W} {height}"
		class="w-full touch-none"
		role="img"
		aria-label="{title} over {points.length} days"
		onpointermove={onmove}
		onpointerleave={() => (hover = null)}
	>
		<!-- Recessive grid: three reference lines, no box, no vertical rules. -->
		{#each ticks as t (t)}
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={scale.y(t)}
				y2={scale.y(t)}
				stroke="var(--color-line)"
				stroke-width="1"
			/>
			<text x={PAD.left - 8} y={scale.y(t) + 3.5} text-anchor="end" class="fill-[var(--color-ink-3)] text-[10px]">
				{t.toFixed(1)}
			</text>
		{/each}

		<path d={path} fill="none" stroke={color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

		{#if points.length <= 30}
			{#each points as p, i (p.day)}
				<circle cx={scale.x(i)} cy={scale.y(p.value)} r="3" fill={color} />
			{/each}
		{/if}

		{#if hover !== null}
			<line
				x1={scale.x(hover)}
				x2={scale.x(hover)}
				y1={PAD.top}
				y2={height - PAD.bottom}
				stroke="var(--color-ink-3)"
				stroke-width="1"
				stroke-dasharray="3 3"
			/>
			<circle
				cx={scale.x(hover)}
				cy={scale.y(points[hover].value)}
				r="5"
				fill={color}
				stroke="var(--color-surface-1)"
				stroke-width="2"
			/>
		{/if}

		<!-- Only the endpoints are labelled; a date on every tick would crowd. -->
		<text x={PAD.left} y={height - 6} class="fill-[var(--color-ink-3)] text-[10px]">
			{points[0]?.day.slice(5)}
		</text>
		<text x={W - PAD.right} y={height - 6} text-anchor="end" class="fill-[var(--color-ink-3)] text-[10px]">
			{points.at(-1)?.day.slice(5)}
		</text>
	</svg>
</figure>
