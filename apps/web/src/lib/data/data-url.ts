/** The bytes behind a URL; a data URL is decoded in place, because the content security policy keeps `fetch` off `data:`. */
export async function bytesOf(url: string): Promise<Uint8Array> {
	const inline = /^data:[^,]*?(;base64)?,(.*)$/su.exec(url);
	if (inline)
		return inline[1]
			? Uint8Array.from(atob(inline[2]), (char) => char.charCodeAt(0))
			: new TextEncoder().encode(decodeURIComponent(inline[2]));
	const response = await fetch(url, { credentials: 'omit' });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
}
