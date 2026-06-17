
import { GoogleGenAI, Modality } from "@google/genai";
import type {
	GarmentAnalysis,
	GarmentMode,
	PromptLabShotKind,
} from "../types.ts";

export interface ImageInput {
  data: string; // base64 string with data URI prefix
  mimeType: string;
}

export interface GenerateImageResult {
  imageBase64: string;
  groundingMetadata?: any;
}

const toInlineData = (img: ImageInput) => ({
	inlineData: {
		data: img.data.includes(",") ? img.data.split(",")[1] : img.data,
		mimeType: img.mimeType,
	},
});

const coerceList = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter(Boolean);
};

const normalizeGarmentAnalysis = (
	raw: any,
	garmentMode: GarmentMode,
): GarmentAnalysis => ({
	baseGarment:
		typeof raw?.baseGarment === "string" && raw.baseGarment.trim()
			? raw.baseGarment.trim()
			: typeof raw?.garmentType === "string" && raw.garmentType.trim()
				? raw.garmentType.trim()
				: "garment",
	garmentSubtype:
		typeof raw?.garmentSubtype === "string" && raw.garmentSubtype.trim()
			? raw.garmentSubtype.trim()
			: "",
	classification:
		raw?.classification === "primary" || raw?.classification === "secondary"
			? raw.classification
			: garmentMode,
	colors: coerceList(raw?.colors),
	patterns: coerceList(raw?.patterns),
	materials: coerceList(raw?.materials || raw?.material),
	fitDescriptors: coerceList(raw?.fitDescriptors),
	silhouette: coerceList(raw?.silhouette),
	constructionDetails: coerceList(raw?.constructionDetails || raw?.constructionFeatures),
	distinctiveDetails: coerceList(raw?.distinctiveDetails || raw?.complexFeatures),
	visibilityNotes: coerceList(raw?.visibilityNotes),
	confidence:
		typeof raw?.confidence === "number"
			? Math.max(0, Math.min(1, raw.confidence))
			: 0,
});

const getResponseText = (response: any) => {
	if (typeof response.text === "string") return response.text;
	const part = response.candidates?.[0]?.content?.parts?.find(
		(candidatePart: any) => typeof candidatePart.text === "string",
	);
	return part?.text || "";
};

export const parseJsonFromGeminiText = (text: string) => {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	const candidate = fenced?.[1]?.trim() || trimmed;

	try {
		return JSON.parse(candidate);
	} catch {
		const objectStart = candidate.indexOf("{");
		const objectEnd = candidate.lastIndexOf("}");
		if (objectStart !== -1 && objectEnd > objectStart) {
			return JSON.parse(candidate.slice(objectStart, objectEnd + 1));
		}
		throw new Error("Gemini returned text that could not be parsed as JSON.");
	}
};

export const analyzeGarmentForPromptLab = async (
	image: ImageInput,
	garmentMode: GarmentMode,
): Promise<GarmentAnalysis> => {
	try {
		const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
		const schema = {
			type: "object",
			properties: {
				baseGarment: { type: "string" },
				garmentSubtype: { type: "string" },
				classification: { type: "string", enum: ["primary", "secondary"] },
				colors: { type: "array", items: { type: "string" } },
				patterns: { type: "array", items: { type: "string" } },
				materials: { type: "array", items: { type: "string" } },
				fitDescriptors: { type: "array", items: { type: "string" } },
				silhouette: { type: "array", items: { type: "string" } },
				constructionDetails: { type: "array", items: { type: "string" } },
				distinctiveDetails: { type: "array", items: { type: "string" } },
				visibilityNotes: { type: "array", items: { type: "string" } },
				confidence: { type: "number" },
			},
			required: [
				"baseGarment",
				"garmentSubtype",
				"classification",
				"colors",
				"patterns",
				"materials",
				"fitDescriptors",
				"silhouette",
				"constructionDetails",
				"distinctiveDetails",
				"visibilityNotes",
				"confidence",
			],
		};

		const response = await ai.models.generateContent({
			model: "gemini-3.5-flash",
			contents: {
				parts: [
					toInlineData(image),
					{
						text: `Analyze this garment image for an admin prompt-building tool.
The user classified it as a ${garmentMode} garment.
Return structured JSON only.
baseGarment must be exactly one generic lowercase noun, such as shirt, jacket, dress, trousers, skirt, shoe, boot, bag, hat, or sweater.
garmentSubtype should be a compact subtype when useful, such as blazer, polo, hoodie, loafer, or mini dress. Leave it as the same word as baseGarment if no subtype is visible.
Keep each array item short, usually one to three words.
Separate colors from patterns.
Always capture fitDescriptors and silhouette, even when the garment is primary, because the UI decides whether to include fit in generated prompts.
Describe only visible or strongly inferable product attributes. Avoid invisible details.
Do not generate prompt ladder text. Only extract garment facts.`,
					},
				],
			},
			config: {
				responseMimeType: "application/json",
				responseSchema: schema,
			} as any,
		});

		const responseText = getResponseText(response);
		if (!responseText.trim()) {
			throw new Error("No analysis JSON returned from Gemini.");
		}

		return normalizeGarmentAnalysis(
			parseJsonFromGeminiText(responseText),
			garmentMode,
		);
	} catch (error: any) {
		console.error("Gemini analysis error:", error);
		if (error instanceof Error) {
			throw new Error(`Failed to analyze garment: ${error.message}`);
		}
		throw new Error("An unexpected error occurred while analyzing the garment.");
	}
};

const buildPromptLabGenerationPrompt = (
	kind: PromptLabShotKind,
	analysis: GarmentAnalysis,
) => {
	const attributes = [
		analysis.colors.length ? `Colors: ${analysis.colors.join(", ")}` : "",
		analysis.patterns.length
			? `Patterns: ${analysis.patterns.join(", ")}`
			: "",
		analysis.materials.length ? `Materials: ${analysis.materials.join(", ")}` : "",
		analysis.fitDescriptors.length
			? `Fit descriptors: ${analysis.fitDescriptors.join(", ")}`
			: "",
		analysis.silhouette.length
			? `Silhouette: ${analysis.silhouette.join(", ")}`
			: "",
		analysis.constructionDetails.length
			? `Construction: ${analysis.constructionDetails.join(", ")}`
			: "",
		analysis.distinctiveDetails.length
			? `Distinctive details: ${analysis.distinctiveDetails.join(", ")}`
			: "",
	]
		.filter(Boolean)
		.join("\n");

	if (kind === "offBody") {
		return `Create a polished off-body product photography shot of this ${analysis.baseGarment} on a pure white background.
Preserve visible color, material, construction, pattern, and distinguishing details from the reference image.
No body, mannequin, hanger, props, text overlays, or decorative background.
Use clean catalog lighting and only natural product-photo shadowing.
${attributes}`;
	}

	return `Create a cropped on-body product photography shot focused on this ${analysis.baseGarment} worn by a generic person on a pure white background.
The garment must be on a simple human body form, not floating in space.
No face, head, or identifiable person should be visible.
Use plain white basic companion garments only where needed so the crop looks natural, without describing or styling those garments.
Preserve visible color, material, construction, pattern, and distinguishing details from the reference image.
${attributes}`;
};

export const generatePromptLabProductShot = async (
	kind: PromptLabShotKind,
	image: ImageInput,
	analysis: GarmentAnalysis,
): Promise<GenerateImageResult> => {
	try {
		const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
		const response = await ai.models.generateContent({
			model: "gemini-3-pro-image",
			contents: {
				parts: [
					toInlineData(image),
					{ text: buildPromptLabGenerationPrompt(kind, analysis) },
				],
			},
			config: {
				responseModalities: [Modality.IMAGE],
				imageConfig: {
					aspectRatio: "2:3",
					imageSize: "1K",
				},
			} as any,
		});

		const generatedPart = response.candidates?.[0]?.content?.parts?.find(
			(p) => p.inlineData,
		);

		if (generatedPart?.inlineData?.data) {
			return {
				imageBase64: `data:image/jpeg;base64,${generatedPart.inlineData.data}`,
				groundingMetadata: response.candidates?.[0]?.groundingMetadata,
			};
		}

		throw new Error("No image data returned from the model.");
	} catch (error: any) {
		console.error("Gemini prompt lab image error:", error);
		if (error instanceof Error) {
			throw new Error(`Failed to generate product shot: ${error.message}`);
		}
		throw new Error("An unexpected error occurred while generating the product shot.");
	}
};

/**
 * Edits or transforms images based on a text prompt using Gemini.
 * Supports multiple reference images.
 */
export const editImageWithGemini = async (
  images: ImageInput[],
  prompt: string,
  resolution?: string,
  aspectRatio?: string,
  useGrounding: boolean = false
): Promise<GenerateImageResult> => {
  try {
    // Create instance inside function to use the most up-to-date API key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = [];

    // Add all image parts
    images.forEach((img) => {
      parts.push(toInlineData(img));
    });

    // Add text prompt
    parts.push({
      text: prompt,
    });

    const config: any = {
      responseModalities: [Modality.IMAGE],
    };

    if (useGrounding) {
      config.tools = [{ googleSearch: {} }];
    }

    const imageConfig: any = {};
    if (resolution) {
      imageConfig.imageSize = resolution;
    }
    if (aspectRatio && aspectRatio !== 'Original') {
      imageConfig.aspectRatio = aspectRatio;
    }

    if (Object.keys(imageConfig).length > 0) {
      config.imageConfig = imageConfig;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: parts,
      },
      config: config,
    });

    const generatedPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    if (generatedPart && generatedPart.inlineData && generatedPart.inlineData.data) {
      const imageBytes = generatedPart.inlineData.data;
      return {
        imageBase64: `data:image/jpeg;base64,${imageBytes}`,
        groundingMetadata
      };
    } else {
      throw new Error("No image data returned from the model.");
    }
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Handle the specific error case for missing API key/project
    if (error?.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_NOT_FOUND");
    }
    if (error instanceof Error) {
      throw new Error(`Failed to generate image: ${error.message}`);
    }
    throw new Error("An unexpected error occurred while communicating with the AI.");
  }
};
