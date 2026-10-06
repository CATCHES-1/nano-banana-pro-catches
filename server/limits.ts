/**
 * Operational bounds for the service, each overridable by environment variable so a deploy can
 * tune them without a code change. Values are milliseconds, bytes, or entries.
 */

const fromEnv = (name: string, fallback: number): number => {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** Whole-request budget for /analyze and /optimize-decision; a 504 past it. */
export const REQUEST_TIMEOUT_MS = fromEnv("PROMPTLAB_REQUEST_TIMEOUT_MS", 120_000);
/** One reference-image download. */
export const IMAGE_FETCH_TIMEOUT_MS = fromEnv("PROMPTLAB_IMAGE_FETCH_TIMEOUT_MS", 15_000);
/** One Gemini call made from the server's own code (optimizeDecision). */
export const GEMINI_TIMEOUT_MS = fromEnv("PROMPTLAB_GEMINI_TIMEOUT_MS", 90_000);
/** Largest accepted request body. */
export const MAX_BODY_BYTES = fromEnv("PROMPTLAB_MAX_BODY_BYTES", 2_000_000);
/** Garment analyses kept per process (one per reference-image URL). */
export const MAX_ANALYSIS_CACHE = fromEnv("PROMPTLAB_MAX_ANALYSIS_CACHE", 256);
