export interface PresetConfig {
	name: string;
	prompt: string;
	resolution: string;
	aspectRatio: string;
	helperText: string;
}

export const PRESET_CONFIGS: PresetConfig[] = [
	{
		name: "Product Shot",
		prompt:
			"Make a white product only e-commerce photograph of this exact product in image 1 with a white minimalist pure-white backdrop centered in the frame. soft even shadows.",
		resolution: "2K",
		aspectRatio: "2:3",
		helperText:
			"Add a product image as reference image. Adjust prompt to describe product if multiple visible.",
	},
	{
		name: "Full Body Try-On",
		prompt:
			"Make minimalist basic white full body e-commerce photograph of this exact person in image 1 wearing the exact outfit in image 2 - The model is standing in front of a seamless white minimalist backdrop centered in the frame. soft even shadows.",
		resolution: "2K",
		aspectRatio: "2:3",
		helperText:
			"Add a person/face image as first reference image. Add the outfit image as image 2. If you have multiple product images follow prompt format and describe product.",
	},
];
