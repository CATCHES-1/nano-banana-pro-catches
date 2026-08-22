/**
 * Checks the parts of the improve step that must hold without calling Gemini: the prompt is always
 * rendered by Prompt Lab's own builder, and the word caps survive every level/toggle combination.
 */

import { getDefaultPromptToggles } from "../features/garmentPromptLab/promptBuilder.ts";
import type { GarmentAnalysis } from "../types.ts";
import { mimeTypeFor, toHttpUrl } from "./imageInput.ts";
import { renderPrompt, SLOTS, type Slot } from "./optimizeDecision.ts";

const assert = (condition: unknown, message: string) => {
	if (!condition) throw new Error(message);
};

const MAX_WORDS: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 8, 5: 20 };
const wordCount = (prompt: string) => prompt.trim().split(/\s+/).filter(Boolean).length;

const analysis: GarmentAnalysis = {
	baseGarment: "baseball jersey",
	garmentSubtype: "jersey",
	classification: "primary",
	colors: ["navy blue"],
	patterns: ["pinstripe"],
	materials: ["jersey knit"],
	fitDescriptors: ["relaxed"],
	silhouette: ["short sleeve"],
	constructionDetails: ["white polo collar", "v-neck placket"],
	distinctiveDetails: ["script Yankees logo"],
	visibilityNotes: [],
	confidence: 0.9,
};

// --- every level/toggle combination stays inside Prompt Lab's word cap -----------------------

const allToggleSets = () => {
	const keys = [
		"includeColor",
		"includePattern",
		"includeMaterial",
		"includeFit",
		"includeDetails",
	] as const;
	const sets = [];
	for (let mask = 0; mask < 1 << keys.length; mask += 1) {
		sets.push(
			Object.fromEntries(keys.map((key, i) => [key, Boolean(mask & (1 << i))])) as Record<
				(typeof keys)[number],
				boolean
			>,
		);
	}
	return sets;
};

for (const toggles of allToggleSets()) {
	for (const level of [1, 2, 3, 4, 5] as const) {
		const prompt = renderPrompt(analysis, level, toggles);
		assert(prompt.length > 0, `Level ${level} produced an empty prompt`);
		assert(
			wordCount(prompt) <= MAX_WORDS[level],
			`Level ${level} exceeded its ${MAX_WORDS[level]}-word cap: "${prompt}"`,
		);
	}
}

// --- the level actually selects the matching Prompt Lab level --------------------------------

const defaults = getDefaultPromptToggles(analysis.classification);
assert(
	renderPrompt(analysis, 1, defaults) === "jersey",
	"Level 1 should be the single-word garment term",
);
assert(
	wordCount(renderPrompt(analysis, 5, defaults)) >= wordCount(renderPrompt(analysis, 2, defaults)),
	"A higher level should not be terser than a lower one",
);

// --- reducing detail never introduces new words ----------------------------------------------

const detailed = renderPrompt(analysis, 4, defaults);
const reduced = renderPrompt(analysis, 4, { ...defaults, includeDetails: false });
assert(
	wordCount(reduced) <= wordCount(detailed),
	"Turning a toggle off should not lengthen the prompt",
);

// --- slots match the generation request -------------------------------------------------------

const expectedSlots: Slot[] = ["top", "bottom", "hands", "feet"];
assert(
	JSON.stringify([...SLOTS]) === JSON.stringify(expectedSlots),
	"Slots must match the ai-image-direct prompt slots",
);

// --- image url handling ------------------------------------------------------------------------

assert(
	toHttpUrl("gs://bucket/a/b.png") === "https://storage.googleapis.com/bucket/a/b.png",
	"gs:// should be rewritten to the public https form",
);
assert(
	toHttpUrl("https://clips.dev.catches.ai/x.png") === "https://clips.dev.catches.ai/x.png",
	"An https url should pass through unchanged",
);
assert(mimeTypeFor("a/b.JPG") === "image/jpeg", "Uppercase extensions should resolve");
assert(mimeTypeFor("a/b.webp") === "image/webp", "webp should resolve");
assert(
	mimeTypeFor("https://host/x.png?sig=abc") === "image/png",
	"A query string should not defeat extension sniffing",
);
assert(mimeTypeFor("https://host/no-extension") === "image/png", "Unknown types default to png");

console.log("optimizeDecision: all checks passed");
