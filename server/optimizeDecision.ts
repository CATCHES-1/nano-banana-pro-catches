/**
 * The improve step of the garment optimizer loop.
 *
 * Prompt Lab's guidelines are executed, not restated: the model never writes prompt text. It picks
 * a verbosity level and a descriptor toggle set per slot, and `buildPromptLevels` renders the
 * actual prompt — so the word caps and the positive-only phrasing stay enforced by the same code
 * the Prompt Lab UI uses. One decision call per iteration, over the aggregated findings.
 */

import { GoogleGenAI } from "@google/genai";
import {
	buildPromptLevels,
	getDefaultPromptToggles,
	type PromptBuilderToggles,
} from "../features/garmentPromptLab/promptBuilder.ts";
import {
	analyzeGarmentForPromptLab,
	parseJsonFromGeminiText,
} from "../services/geminiService.ts";
import type { GarmentAnalysis } from "../types.ts";
import { fetchImageInput } from "./imageInput.ts";

/** The same model geminiService uses for its structured-JSON garment analysis. */
const MODEL = "gemini-3.5-flash";

/** Slots a try-on prompt is composed of, matching the generation request. */
export const SLOTS = ["top", "bottom", "hands", "feet"] as const;
export type Slot = (typeof SLOTS)[number];

export interface AreaIssue {
	area: string;
	issue_count: number;
	severity: number;
	targeted: boolean;
	reasons: string[];
}

export interface DecisionRequest {
	session_id?: string;
	iteration?: number;
	target_body_area?: string | null;
	candidate: { prompts?: Record<string, string>; images?: Record<string, string | null> };
	best_scores?: Record<string, number>;
	findings?: Record<string, AreaIssue[]>;
	worst_samples?: Record<string, string[]>;
}

export interface SlotDecision {
	level: 1 | 2 | 3 | 4 | 5;
	toggles: PromptBuilderToggles;
	reason: string;
}

export interface DecisionResponse {
	candidate: { prompts: Record<string, string>; images: Record<string, string | null> } | null;
	rationale: string;
	decisions?: Record<string, SlotDecision>;
}

const SYSTEM_PROMPT = `You tune the INPUTS of a virtual try-on generator, never the generator itself.

An automated loop renders a garment onto mannequins and scores each render two ways: segmentation
IoU against the garment holdout, and a hallucination check against the reference collage. You are
called ONCE per iteration with the findings aggregated over every render. Your job is to choose,
for each garment slot, how much of the garment analysis the prompt should state.

The reference image is the source of truth. The prompt exists only to name what is already visible,
so the correct move for a hallucination is almost always to say LESS, not more:

- Invented features, branding or structure that are not in the reference -> lower the level, or turn
  off the toggle that introduced the wrong descriptor. Extra words invite the model to invent.
- A garment element missing from the render that IS in the reference -> raise the level one step so
  the element is named.
- Colour or material wrong -> keep the level and toggle colour/material on; do not add adjectives.
- Findings on an area with no matching slot (for example "global") -> usually a level reduction on
  the targeted slot.

Rules:
- Never write prompt text. Choose a level (1-5) and the toggles; the prompt is rendered for you.
- Change as little as possible: prefer one slot per iteration, and one step of level at a time.
- The targeted area gets priority; leave clean slots exactly as they are.
- If the findings give you no actionable signal, or you would repeat the current candidate, stop.

Levels: 1 = one word, 2 = up to three words, 3 = up to five words, 4 = up to eight words,
5 = up to twenty words.`;

const DECISION_SCHEMA = {
	type: "object",
	properties: {
		stop: { type: "boolean" },
		rationale: { type: "string" },
		slots: {
			type: "array",
			items: {
				type: "object",
				properties: {
					slot: { type: "string", enum: [...SLOTS] },
					level: { type: "integer" },
					includeColor: { type: "boolean" },
					includePattern: { type: "boolean" },
					includeMaterial: { type: "boolean" },
					includeFit: { type: "boolean" },
					includeDetails: { type: "boolean" },
					reason: { type: "string" },
				},
				required: [
					"slot",
					"level",
					"includeColor",
					"includePattern",
					"includeMaterial",
					"includeFit",
					"includeDetails",
					"reason",
				],
			},
		},
	},
	required: ["stop", "rationale", "slots"],
};

/** In-process analysis cache: the reference images are fixed for a whole search. */
const analysisCache = new Map<string, GarmentAnalysis>();

export const analyseSlotImages = async (
	images: Record<string, string | null> = {},
): Promise<Record<string, GarmentAnalysis>> => {
	const entries = SLOTS.filter((slot) => images[slot]).map(async (slot) => {
		const url = images[slot] as string;
		const cached = analysisCache.get(url);
		if (cached) return [slot, cached] as const;
		const image = await fetchImageInput(url);
		const analysis = await analyzeGarmentForPromptLab(
			image,
			slot === "top" ? "primary" : "secondary",
		);
		analysisCache.set(url, analysis);
		return [slot, analysis] as const;
	});
	const settled = await Promise.allSettled(entries);
	return Object.fromEntries(
		settled
			.filter(
				(result): result is PromiseFulfilledResult<readonly [Slot, GarmentAnalysis]> =>
					result.status === "fulfilled",
			)
			.map((result) => result.value),
	);
};

const clampLevel = (value: unknown): SlotDecision["level"] => {
	const level = Math.round(Number(value));
	if (!Number.isFinite(level)) return 1;
	return Math.min(5, Math.max(1, level)) as SlotDecision["level"];
};

/** Render the prompt for a slot from the chosen level and toggles — never from model text. */
export const renderPrompt = (
	analysis: GarmentAnalysis,
	level: SlotDecision["level"],
	toggles: PromptBuilderToggles,
): string => {
	const levels = buildPromptLevels(analysis, toggles);
	return levels.find((entry) => entry.level === level)?.prompt ?? levels[0].prompt;
};

const optionsForSlot = (analysis: GarmentAnalysis) => {
	const toggles = getDefaultPromptToggles(analysis.classification);
	return buildPromptLevels(analysis, toggles).map(({ level, prompt }) => ({ level, prompt }));
};

export const decide = async (request: DecisionRequest): Promise<DecisionResponse> => {
	const analyses = await analyseSlotImages(request.candidate.images ?? {});
	if (Object.keys(analyses).length === 0) {
		return {
			candidate: null,
			rationale: "No slot reference image could be analysed, so no prompt can be rebuilt.",
		};
	}

	const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
	const brief = {
		iteration: request.iteration ?? 0,
		target_body_area: request.target_body_area ?? null,
		gate_scores: request.best_scores ?? {},
		findings: request.findings ?? {},
		worst_samples: request.worst_samples ?? {},
		current_prompts: request.candidate.prompts ?? {},
		slots: Object.fromEntries(
			Object.entries(analyses).map(([slot, analysis]) => [
				slot,
				{
					analysis,
					prompt_options: optionsForSlot(analysis),
				},
			]),
		),
	};

	const response = await ai.models.generateContent({
		model: MODEL,
		contents: [{ text: JSON.stringify(brief) }],
		config: {
			systemInstruction: SYSTEM_PROMPT,
			responseMimeType: "application/json",
			responseSchema: DECISION_SCHEMA,
		},
	});

	const parsed = parseJsonFromGeminiText(response.text ?? "");
	if (!parsed || parsed.stop || !Array.isArray(parsed.slots) || parsed.slots.length === 0) {
		return {
			candidate: null,
			rationale: parsed?.rationale ?? "The improve step declined to suggest a change.",
		};
	}

	const prompts = { ...(request.candidate.prompts ?? {}) };
	const decisions: Record<string, SlotDecision> = {};
	for (const entry of parsed.slots) {
		const slot = entry?.slot as Slot;
		const analysis = analyses[slot];
		if (!analysis) continue;
		const toggles: PromptBuilderToggles = {
			includeColor: Boolean(entry.includeColor),
			includePattern: Boolean(entry.includePattern),
			includeMaterial: Boolean(entry.includeMaterial),
			includeFit: Boolean(entry.includeFit),
			includeDetails: Boolean(entry.includeDetails),
		};
		const level = clampLevel(entry.level);
		prompts[slot] = renderPrompt(analysis, level, toggles);
		decisions[slot] = { level, toggles, reason: String(entry.reason ?? "") };
	}

	if (Object.keys(decisions).length === 0) {
		return { candidate: null, rationale: "No decision named a slot with a usable reference." };
	}

	const unchanged = SLOTS.every(
		(slot) => (prompts[slot] ?? "") === (request.candidate.prompts?.[slot] ?? ""),
	);
	if (unchanged) {
		return {
			candidate: null,
			rationale: "The suggested prompts are identical to the current candidate.",
		};
	}

	return {
		candidate: { prompts, images: request.candidate.images ?? {} },
		rationale: String(parsed.rationale ?? ""),
		decisions,
	};
};
