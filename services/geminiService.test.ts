import { parseJsonFromGeminiText } from "./geminiService.ts";

const fencedJson = `\`\`\`json
{
  "garmentType": "shirt",
  "classification": "primary"
}
\`\`\``;

const parsed = parseJsonFromGeminiText(fencedJson);

if (parsed.garmentType !== "shirt") {
	throw new Error("Expected fenced JSON to parse into an object.");
}
