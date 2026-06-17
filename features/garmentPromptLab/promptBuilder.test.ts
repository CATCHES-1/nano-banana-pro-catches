import {
	buildPromptLevels,
	type PromptBuilderToggles,
} from "./promptBuilder.ts";
import type { GarmentAnalysis } from "../../types.ts";

const wordCount = (prompt: string) => prompt.trim().split(/\s+/).filter(Boolean).length;
const maxWordsByLevel = {
	1: 1,
	2: 3,
	3: 5,
	4: 8,
	5: 20,
} as const;

const analysis: GarmentAnalysis = {
	baseGarment: "jacket",
	garmentSubtype: "blazer",
	classification: "primary",
	colors: ["black", "ivory"],
	patterns: ["pinstripe"],
	materials: ["wool twill"],
	fitDescriptors: ["cropped", "boxy"],
	silhouette: ["structured shoulders"],
	constructionDetails: ["notched lapels", "single button closure"],
	distinctiveDetails: ["contrast topstitching", "embroidered chest logo"],
	visibilityNotes: ["waistband details would not be visible in a crop"],
	confidence: 0.92,
};

const toggles: PromptBuilderToggles = {
	includeColor: true,
	includePattern: true,
	includeMaterial: true,
	includeFit: false,
	includeDetails: true,
};

const levels = buildPromptLevels(analysis, toggles);

if (levels.length !== 5) {
	throw new Error("Prompt builder must return exactly five levels.");
}

if (levels[0].prompt !== "jacket") {
	throw new Error(`Expected Level 1 to be exactly one base word, got "${levels[0].prompt}".`);
}

for (const level of levels) {
	if (wordCount(level.prompt) > maxWordsByLevel[level.level]) {
		throw new Error(
			`Level ${level.level} exceeded ${maxWordsByLevel[level.level]} words: "${level.prompt}"`,
		);
	}
}

if (levels[2].prompt.includes("cropped") || levels[2].prompt.includes("boxy")) {
	throw new Error("Prompt builder included fit descriptors while disabled.");
}

const noPatternLevels = buildPromptLevels(analysis, {
	...toggles,
	includePattern: false,
});

if (noPatternLevels.some((level) => level.prompt.includes("pinstripe"))) {
	throw new Error("Pattern terms should be controlled separately from color.");
}

const fitLevels = buildPromptLevels(analysis, {
	...toggles,
	includeFit: true,
});

if (!fitLevels[3].prompt.includes("cropped")) {
	throw new Error("Fit toggle should allow compact fit descriptors into higher levels.");
}

if (levels[3].prompt === levels[2].prompt) {
	throw new Error("Level 4 should add detail instead of duplicating Level 3.");
}

const jerseyLevels = buildPromptLevels(
	{
		baseGarment: "shirt",
		garmentSubtype: "jersey",
		classification: "primary",
		colors: ["navy", "white"],
		patterns: ["checker tonal"],
		materials: ["jersey knit"],
		fitDescriptors: ["relaxed"],
		silhouette: ["short sleeve"],
		constructionDetails: ["white polo collar", "v-neck placket"],
		distinctiveDetails: ["script Yankees logo"],
		visibilityNotes: [],
		confidence: 0.9,
	},
	toggles,
);

if (jerseyLevels[3].prompt === jerseyLevels[2].prompt) {
	throw new Error("Jersey Level 4 should introduce a visible detail.");
}

if (wordCount(jerseyLevels[3].prompt) > 8) {
	throw new Error("Jersey Level 4 exceeded the eight-word target.");
}

if (jerseyLevels.some((level) => level.prompt.includes("jersey knit jersey"))) {
	throw new Error("Descriptor terms should not duplicate the garment category.");
}
