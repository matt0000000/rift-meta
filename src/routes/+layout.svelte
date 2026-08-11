<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
	<header class="mb-6 flex items-baseline justify-between border-b border-line pb-4">
		<a href="/" class="flex items-baseline gap-2.5">
			<span class="text-lg font-semibold tracking-tight">Rift Meta</span>
			<span class="text-ink-3 hidden text-xs sm:inline">Emerald+ · World · Ranked Solo/Duo</span>
		</a>
		<span class="text-ink-3 text-xs">Data from Lolalytics</span>
	</header>

	{@render children()}

	<footer class="text-ink-3 mt-10 border-t border-line pt-4 text-xs leading-relaxed">
		Champion stats sourced daily from Lolalytics; portraits and champion data from Riot's Data
		Dragon. Not endorsed by Riot Games.
	</footer>
</div>
