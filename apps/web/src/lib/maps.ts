/** Google Maps search for an address or place, e.g. «Kirchenfeldstrasse 41, Biel/Bienne». */
export function mapsUrl(place: string): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.trim())}`;
}
