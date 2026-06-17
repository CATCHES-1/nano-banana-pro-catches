import type { GarmentAnalysis } from "../../types.ts";

export interface PromptBuilderToggles {
	includeColor: boolean;
	includePattern: boolean;
	includeMaterial: boolean;
	includeFit: boolean;
	includeDetails: boolean;
}

export interface PromptLevel {
	level: 1 | 2 | 3 | 4 | 5;
	title: string;
	prompt: string;
}

const MAX_WORDS_BY_LEVEL: Record<PromptLevel["level"], number> = {
	1: 1,
	2: 3,
	3: 5,
	4: 8,
	5: 20,
};

const cleanTerm = (term: unknown) =>
	typeof term === "string"
		? term
				.trim()
				.replace(/[,\n\r]+/g, " ")
				.replace(/\s+/g, " ")
		: "";

const cleanTerms = (terms: unknown): string[] =>
	Array.isArray(terms)
		? terms.map(cleanTerm).filter(Boolean)
		: [];

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const getSingleWordGarment = (analysis: GarmentAnalysis) => {
	const raw =
		cleanTerm((analysis as any).baseGarment) ||
		cleanTerm((analysis as any).garmentType) ||
		"garment";
	const words = raw.split(/\s+/).filter(Boolean);
	return words[words.length - 1] || "garment";
};

const getCategoryTerm = (analysis: GarmentAnalysis) => {
	const subtype = cleanTerm((analysis as any).garmentSubtype);
	return subtype || getSingleWordGarment(analysis);
};

const stripGarmentWords = (term: string, garmentWords: string[]) => {
	const words = term.split(/\s+/).filter(Boolean);
	if (words.length <= 1) return term;
	const filtered = words.filter(
		(word) => !garmentWords.includes(word.toLowerCase()),
	);
	return filtered.join(" ");
};

const appendIfFits = (parts: string[], term: string, maxWords: number) => {
	if (!term) return parts;
	const next = [...parts, term];
	return countWords(next.join(" ")) <= maxWords ? next : parts;
};

const buildCompactPrompt = (
	maxWords: number,
	category: string,
	beforeCategory: string[],
	details: string[] = [],
) => {
	let parts: string[] = [];

	beforeCategory.forEach((term) => {
		parts = appendIfFits(parts, term, Math.max(1, maxWords - countWords(category)));
	});

	parts = appendIfFits(parts, category, maxWords);

	let detailParts: string[] = [];
	details.forEach((detail) => {
		const nextDetails = [...detailParts, detail];
		const basePrompt = parts.join(" ") || category;
		const nextPrompt = `${basePrompt} with ${nextDetails.join(", ")}`;
		if (countWords(nextPrompt) <= maxWords) {
			detailParts = nextDetails;
		}
	});

	const basePrompt = parts.join(" ") || category;
	return detailParts.length > 0
		? `${basePrompt} with ${detailParts.join(", ")}`
		: basePrompt;
};

export const getDefaultPromptToggles = (
	classification: GarmentAnalysis["classification"],
): PromptBuilderToggles => ({
	includeColor: true,
	includePattern: true,
	includeMaterial: true,
	includeFit: classification === "secondary",
	includeDetails: true,
});

export const buildPromptLevels = (
	analysis: GarmentAnalysis,
	toggles: PromptBuilderToggles,
): PromptLevel[] => {
	const baseGarment = getSingleWordGarment(analysis);
	const category = getCategoryTerm(analysis);
	const garmentWords = [baseGarment, category]
		.flatMap((term) => term.toLowerCase().split(/\s+/))
		.filter(Boolean);
	const cleanDescriptors = (terms: unknown) =>
		cleanTerms(terms)
			.map((term) => stripGarmentWords(term, garmentWords))
			.filter(Boolean);
	const colors = toggles.includeColor ? cleanDescriptors((analysis as any).colors) : [];
	const patterns = toggles.includePattern
		? cleanDescriptors((analysis as any).patterns)
		: [];
	const materials = toggles.includeMaterial
		? cleanDescriptors((analysis as any).materials || (analysis as any).material)
		: [];
	const fit = toggles.includeFit
		? [
				...cleanDescriptors((analysis as any).fitDescriptors),
				...cleanDescriptors((analysis as any).silhouette),
		  ]
		: [];
	const details = toggles.includeDetails
		? [
				...cleanDescriptors(
					(analysis as any).constructionDetails ||
						(analysis as any).constructionFeatures,
				),
				...cleanDescriptors(
					(analysis as any).distinctiveDetails || (analysis as any).complexFeatures,
				),
		  ]
		: [];

	const firstColor = colors.slice(0, 1);
	const level2Descriptors =
		firstColor.length > 0 ? firstColor : patterns.slice(0, 1);
	const level3Descriptors = [
		...firstColor,
		...patterns.slice(0, 1),
		...materials.slice(0, 1),
	];
	const fitDescriptors = fit.slice(0, 1);
	const level4Descriptors = [
		...fitDescriptors,
		...firstColor,
		...patterns.slice(0, 1),
		...(details.length > 0 ? [] : materials.slice(0, 1)),
	];
	const level5Descriptors = [
		...fitDescriptors,
		...firstColor,
		...patterns.slice(0, 1),
		...materials.slice(0, 1),
	];

	return [
		{ level: 1, title: "One-word prompt", prompt: baseGarment },
		{
			level: 2,
			title: "Two-to-three-word prompt",
			prompt: buildCompactPrompt(
				MAX_WORDS_BY_LEVEL[2],
				category,
				level2Descriptors,
			),
		},
		{
			level: 3,
			title: "Basic descriptive prompt",
			prompt: buildCompactPrompt(
				MAX_WORDS_BY_LEVEL[3],
				category,
				level3Descriptors,
			),
		},
		{
			level: 4,
			title: "Specific garment prompt",
			prompt: buildCompactPrompt(
				MAX_WORDS_BY_LEVEL[4],
				category,
				level4Descriptors,
				details.slice(0, 1),
			),
		},
		{
			level: 5,
			title: "Maximum reinforcement prompt",
			prompt: buildCompactPrompt(
				MAX_WORDS_BY_LEVEL[5],
				category,
				level5Descriptors,
				details,
			),
		},
	];
};
