<script lang="ts">
	import QRCode from 'qrcode';

	/** A QR code for a link, drawn as SVG in the browser (nothing is sent anywhere). */
	let { value, label }: { value: string; label: string } = $props();
	let svg = $state('');

	$effect(() => {
		void QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }).then((code) => (svg = code));
	});
</script>

<div class="size-24 bg-white p-1 [&>svg]:size-full" role="img" aria-label={label}>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG generated locally by the qrcode library -->
	{@html svg}
</div>
