/**
 * Bearer auth for every route but /health. The expected token comes from PROMPTLAB_AUTH_TOKEN;
 * ai-arena sends the same value as OPTIMIZER_PROMPTLAB_TOKEN. The compare is constant time so a
 * wrong guess learns nothing from the response latency.
 */

import { timingSafeEqual } from "node:crypto";

export const isAuthorized = (header: string | undefined, token: string): boolean => {
	const given = Buffer.from(header ?? "");
	const expected = Buffer.from(`Bearer ${token}`);
	return given.length === expected.length && timingSafeEqual(given, expected);
};
