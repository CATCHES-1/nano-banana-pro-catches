/**
 * Fetch a garment reference image into the ImageInput shape geminiService expects.
 *
 * gs:// URIs are rewritten to their public https form: the Catches clips buckets grant public
 * read on objects, which is all this needs. A private bucket would 403 here — the caller treats
 * that as "no analysis available" rather than failing the iteration.
 */

import type { ImageInput } from "../services/geminiService.ts";

const GCS_HOST = "https://storage.googleapis.com";

const MIME_BY_EXTENSION: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

export const toHttpUrl = (url: string): string =>
	url.startsWith("gs://") ? `${GCS_HOST}/${url.slice("gs://".length)}` : url;

export const mimeTypeFor = (url: string): string => {
	const path = url.split("?")[0];
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return MIME_BY_EXTENSION[extension] ?? "image/png";
};

export const fetchImageInput = async (url: string): Promise<ImageInput> => {
	const response = await fetch(toHttpUrl(url));
	if (!response.ok) {
		throw new Error(`Could not fetch ${url}: ${response.status}`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	const mimeType = response.headers.get("content-type")?.split(";")[0] || mimeTypeFor(url);
	return { data: buffer.toString("base64"), mimeType };
};
