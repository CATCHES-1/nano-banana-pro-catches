import React, { useEffect, useMemo, useState } from "react";
import { ImageUpload } from "../../components/ImageUpload.tsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.tsx";
import {
	analyzeGarmentForPromptLab,
	generatePromptLabProductShot,
	type ImageInput,
} from "../../services/geminiService.ts";
import type {
	GarmentAnalysis,
	GarmentMode,
	PromptLabShotKind,
	SourceImage,
} from "../../types.ts";
import {
	buildPromptLevels,
	getDefaultPromptToggles,
	type PromptBuilderToggles,
	type PromptLevel,
} from "./promptBuilder.ts";

const STORAGE_KEY = "catches-garment-prompt-lab-v1";

interface StoredPromptLabState {
	analysis: GarmentAnalysis | null;
	toggles: PromptBuilderToggles;
	garmentMode: GarmentMode;
}

interface EditablePrompt {
	text: string;
}

interface PromptLabGeneratedImage {
	id: string;
	kind: PromptLabShotKind;
	label: string;
	status: "loading" | "success" | "error";
	url?: string;
	error?: string;
}

const DEFAULT_TOGGLES = getDefaultPromptToggles("primary");

const shotLabels: Record<PromptLabShotKind, string> = {
	offBody: "Off-body product shot",
	onBody: "On-body crop",
};

const normalizeStoredToggles = (
	toggles: Partial<PromptBuilderToggles> | any,
	garmentMode: GarmentMode,
): PromptBuilderToggles => {
	const defaults = getDefaultPromptToggles(garmentMode);
	return {
		includeColor:
			typeof toggles?.includeColor === "boolean"
				? toggles.includeColor
				: typeof toggles?.includeColorPattern === "boolean"
					? toggles.includeColorPattern
					: defaults.includeColor,
		includePattern:
			typeof toggles?.includePattern === "boolean"
				? toggles.includePattern
				: typeof toggles?.includeColorPattern === "boolean"
					? toggles.includeColorPattern
					: defaults.includePattern,
		includeMaterial:
			typeof toggles?.includeMaterial === "boolean"
				? toggles.includeMaterial
				: defaults.includeMaterial,
		includeFit:
			typeof toggles?.includeFit === "boolean"
				? toggles.includeFit
				: defaults.includeFit,
		includeDetails:
			typeof toggles?.includeDetails === "boolean"
				? toggles.includeDetails
				: typeof toggles?.includeConstruction === "boolean"
					? toggles.includeConstruction
					: defaults.includeDetails,
	};
};

const readStoredState = (): StoredPromptLabState => {
	if (typeof window === "undefined") {
		return {
			analysis: null,
			toggles: DEFAULT_TOGGLES,
			garmentMode: "primary",
		};
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {
				analysis: null,
				toggles: DEFAULT_TOGGLES,
				garmentMode: "primary",
			};
		}
		const parsed = JSON.parse(raw) as Partial<StoredPromptLabState>;
		const garmentMode =
			parsed.garmentMode === "secondary" ? "secondary" : "primary";
		return {
			analysis: parsed.analysis || null,
			toggles: normalizeStoredToggles(parsed.toggles, garmentMode),
			garmentMode,
		};
	} catch {
		return {
			analysis: null,
			toggles: DEFAULT_TOGGLES,
			garmentMode: "primary",
		};
	}
};

const ToggleButton: React.FC<{
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
	<label className="flex items-center gap-2.5 cursor-pointer select-none">
		<span className="relative">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="sr-only peer"
			/>
			<span className="block w-8 h-4 bg-monstera-300 rounded-full peer-checked:bg-ink transition-colors" />
			<span className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
		</span>
		<span className="text-[10px] font-black uppercase tracking-widest text-monstera-700">
			{label}
		</span>
	</label>
);

const PromptCard: React.FC<{
	level: PromptLevel;
	editState?: EditablePrompt;
	onTextChange: (level: PromptLevel, value: string) => void;
	onCopy: (level: PromptLevel, text: string) => void;
	copied: boolean;
}> = ({
	level,
	editState,
	onTextChange,
	onCopy,
	copied,
}) => {
	const text = editState?.text ?? level.prompt;
	return (
		<article className="bg-white border border-monstera-200 rounded-md shadow-sm overflow-hidden">
			<div className="px-2.5 py-1.5 bg-monstera-50 border-b border-monstera-200 flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
						Level {level.level}
					</p>
					<h3 className="text-[11px] font-black text-ink truncate">
						{level.title}
					</h3>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					<button
						type="button"
						onClick={() => onCopy(level, text)}
						className="px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded-md border border-ink bg-ink text-white hover:bg-monstera-800 active:scale-[0.96] transition-transform"
					>
						{copied ? "Copied" : "Copy"}
					</button>
				</div>
			</div>
			<textarea
				value={text}
				onChange={(event) => onTextChange(level, event.target.value)}
				className="w-full min-h-[54px] p-2.5 text-[13px] font-medium leading-snug outline-none resize-y bg-white text-ink"
			/>
		</article>
	);
};

const PromptGuidelinesModal: React.FC<{ onClose: () => void }> = ({
	onClose,
}) => (
	<div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3">
		<div className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-lg bg-white shadow-2xl border border-monstera-200">
			<div className="flex items-center justify-between gap-3 border-b border-monstera-200 bg-monstera-50 px-4 py-3">
				<div>
					<p className="text-[9px] font-black uppercase tracking-[0.3em] text-monstera-500">
						Prompt Lab
					</p>
					<h2 className="text-lg font-black text-ink">Prompt Guidelines</h2>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="min-h-10 px-3 rounded-md border border-monstera-200 bg-white text-[9px] font-black uppercase tracking-widest text-monstera-700 hover:border-ink hover:text-ink active:scale-[0.96] transition-transform"
				>
					Close
				</button>
			</div>

			<div className="max-h-[calc(88vh-76px)] overflow-y-auto custom-scrollbar p-4 space-y-4 bg-paper">
				<section className="rounded-lg border border-monstera-200 bg-white p-4 shadow-sm">
					<div className="flex gap-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white">
							<svg
								className="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2.5}
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
						</div>
						<div className="space-y-1">
							<h3 className="text-sm font-black uppercase tracking-widest text-ink">
								Goal
							</h3>
							<p className="text-sm font-medium leading-relaxed text-monstera-800">
								Use the image as the strongest reference. Keep garment prompts
								simple, then add detail only when the output misses something
								important like color, material, pattern, readable text, or a
								cropped secondary garment.
							</p>
						</div>
					</div>
				</section>

				<section className="grid gap-3 md:grid-cols-3">
					<div className="rounded-lg border border-monstera-200 bg-white p-3 shadow-sm">
						<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
							Use Case
						</p>
						<h4 className="mt-1 text-sm font-black text-ink">
							Fix missed attributes
						</h4>
						<p className="mt-2 text-xs font-bold leading-relaxed text-monstera-700">
							Add color, material, pattern, or construction only when the image
							output is not following the reference.
						</p>
					</div>
					<div className="rounded-lg border border-monstera-200 bg-white p-3 shadow-sm">
						<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
							Use Case
						</p>
						<h4 className="mt-1 text-sm font-black text-ink">
							Clarify crops
						</h4>
						<p className="mt-2 text-xs font-bold leading-relaxed text-monstera-700">
							Secondary garments sometimes need just enough detail to make a
							cropped or partially hidden garment read correctly.
						</p>
					</div>
					<div className="rounded-lg border border-monstera-200 bg-white p-3 shadow-sm">
						<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
							Use Case
						</p>
						<h4 className="mt-1 text-sm font-black text-ink">
							Protect text
						</h4>
						<p className="mt-2 text-xs font-bold leading-relaxed text-monstera-700">
							Quote exact lettering or brand words when legibility matters, and
							keep the quoted phrase short.
						</p>
					</div>
				</section>

				<section className="rounded-lg border border-monstera-200 bg-white p-4 shadow-sm space-y-3">
					<h3 className="text-[11px] font-black uppercase tracking-widest text-ink">
						Prompt Testing Ladder
					</h3>
					<div className="grid gap-2 md:grid-cols-4">
						{[
							"Start with the simplest garment name.",
							"Confirm primary or secondary classification.",
							"Add only visible details the output missed.",
							"Stop when the result follows the reference.",
						].map((step, index) => (
							<div
								key={step}
								className="rounded-md bg-monstera-50 p-3 text-xs font-bold leading-relaxed text-monstera-800"
							>
								<span className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] font-black text-white">
									{index + 1}
								</span>
								{step}
							</div>
						))}
					</div>
				</section>

				<section className="grid gap-3 md:grid-cols-2">
					<div className="rounded-lg border border-monstera-200 bg-white p-4 shadow-sm">
						<h4 className="text-[10px] font-black uppercase tracking-widest text-ink">
							Good Prompt Habits
						</h4>
						<ul className="mt-3 space-y-2 text-xs font-bold leading-relaxed text-monstera-700">
							<li>Use visible garment facts from the reference image.</li>
							<li>Keep secondary garment prompts practical and minimal.</li>
							<li>Use more detail only when the model needs correction.</li>
							<li>
								Use quotation marks around garment text or brand words the AI
								may struggle to render legibly.
							</li>
						</ul>
					</div>
					<div className="rounded-lg border border-monstera-200 bg-white p-4 shadow-sm">
						<h4 className="text-[10px] font-black uppercase tracking-widest text-ink">
							Keep It Focused
						</h4>
						<ul className="mt-3 space-y-2 text-xs font-bold leading-relaxed text-monstera-700">
							<li>Do not describe details that will be hidden in the output.</li>
							<li>Do not over-specify companion garments or styling.</li>
							<li>Do not add fit words unless simpler prompts keep failing.</li>
							<li>
								Write what should appear. Avoid relying on "not", "without", or
								"no" to remove details.
							</li>
						</ul>
					</div>
				</section>

				<section className="rounded-lg border border-monstera-200 bg-white p-4 shadow-sm space-y-3">
					<h3 className="text-[11px] font-black uppercase tracking-widest text-ink">
						Examples
					</h3>
					<div className="grid gap-2">
						<div className="rounded-md bg-monstera-50 p-3">
							<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
								Hidden Details
							</p>
							<p className="mt-1 text-xs font-bold leading-relaxed text-monstera-800">
								If the primary garment is a jacket, the secondary bottom prompt
								should skip waistband, drawstring, belt loop, or pocket details
								that will not be visible.
							</p>
						</div>
						<div className="rounded-md bg-monstera-50 p-3">
							<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
								Obscured Accessories
							</p>
							<p className="mt-1 text-xs font-bold leading-relaxed text-monstera-800">
								If trousers will cover most of a shoe, avoid prompt complexity
								around heel shape, boot shaft details, or hardware that the render
								will obscure.
							</p>
						</div>
						<div className="rounded-md bg-monstera-50 p-3">
							<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
								Fit Language
							</p>
							<p className="mt-1 text-xs font-bold leading-relaxed text-monstera-800">
								For primary garments, avoid fit descriptors like oversized or
								slim-fit unless the image model repeatedly misses the intended
								shape. The render garment should usually drive fit.
							</p>
						</div>
						<div className="rounded-md bg-monstera-50 p-3">
							<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
								Readable Text
							</p>
							<p className="mt-1 text-xs font-bold leading-relaxed text-monstera-800">
								If a shirt has a center graphic with readable text, quote the
								important word: T-shirt with "AMIRI" center graphic. For a small
								chest logo, quote only the legible text: white sweatshirt with
								embroidered "CATCHES" chest logo.
							</p>
						</div>
						<div className="rounded-md bg-monstera-50 p-3">
							<p className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
								Positive Prompting
							</p>
							<div className="mt-1 space-y-1 text-xs font-bold leading-relaxed text-monstera-800">
								<p>
									Describe the result you want to see, not the thing you want to
									avoid.
								</p>
								<p>Use: tucked white shirt with clean waistline.</p>
								<p>Avoid: shirt that is not untucked.</p>
								<p>Use: plain white companion pants cropped at the ankle.</p>
								<p>Avoid: no jeans, no patterns, no extra styling.</p>
								<p>Use: smooth front panel with minimal hardware.</p>
								<p>Avoid: without zippers or buttons.</p>
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>
	</div>
);

const QualityChecklistModal: React.FC<{ onClose: () => void }> = ({
	onClose,
}) => {
	const checklistItems = [
		{
			title: "Work through levels 1 to 5",
			body: "Start with the simplest prompt and test each level before adding complexity. The goal is to find the lowest-detail prompt that still preserves the garment accurately.",
		},
		{
			title: "Review both generated shot types",
			body: "Check both off-body and on-body outputs. If a critical feature is missed, add only the detail needed to protect that color, material, pattern, trim, logo, or construction cue.",
		},
		{
			title: "Match garment orientation and structure",
			body: "Compare openings, button direction, collar shape, sleeve shape, closures, front/back orientation, and pose when possible. These are often the first signs that a prompt needs refinement.",
		},
		{
			title: "Use the Generator tab when needed",
			body: "If the templated flow gets close but does not give enough control, move to the Generator tab and write a more custom prompt for that specific image.",
		},
		{
			title: "Audit the Render Garment",
			body: "The Render Garment is the primary garment. Check whether the render itself captures the critical garment features. If repeated outputs miss the same feature, note what needs improvement in the Render Garment reference.",
		},
	];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3">
			<div className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-lg bg-white shadow-2xl border border-monstera-200">
				<div className="flex items-center justify-between gap-3 border-b border-monstera-200 bg-ink px-4 py-3 text-white">
					<div>
						<p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60">
							Final Review
						</p>
						<h2 className="text-lg font-black">Quality Checklist</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="min-h-10 px-3 rounded-md border border-white/20 bg-white text-[9px] font-black uppercase tracking-widest text-ink hover:bg-monstera-50 active:scale-[0.96] transition-transform"
					>
						Close
					</button>
				</div>

				<div className="max-h-[calc(88vh-76px)] overflow-y-auto custom-scrollbar p-4 space-y-4 bg-paper">
					<section className="rounded-lg border border-monstera-200 bg-white p-4 shadow-sm">
						<div className="flex gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-monstera-50 text-ink border border-monstera-200">
								<svg
									className="h-5 w-5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2.5}
										d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
									/>
								</svg>
							</div>
							<div className="space-y-1">
								<h3 className="text-sm font-black uppercase tracking-widest text-ink">
									Before approving prompts
								</h3>
								<p className="text-sm font-medium leading-relaxed text-monstera-800">
									Use this as a visual review guide after analysis and image
									generation. It is meant to catch the details that matter most
									before the prompt set is handed off.
								</p>
							</div>
						</div>
					</section>

					<section className="grid gap-3">
						{checklistItems.map((item, index) => (
							<article
								key={item.title}
								className="flex gap-3 rounded-lg border border-monstera-200 bg-white p-4 shadow-sm"
							>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-black text-white">
									{index + 1}
								</div>
								<div className="space-y-1">
									<h4 className="text-sm font-black text-ink">{item.title}</h4>
									<p className="text-xs font-bold leading-relaxed text-monstera-700">
										{item.body}
									</p>
								</div>
							</article>
						))}
					</section>

					<section className="rounded-lg border border-monstera-200 bg-monstera-50 p-4">
						<p className="text-[10px] font-black uppercase tracking-widest text-ink">
							Signal to document
						</p>
						<p className="mt-2 text-xs font-bold leading-relaxed text-monstera-800">
							If multiple prompts fail on the same garment feature, call that out
							as a Render Garment improvement instead of continuing to add prompt
							complexity.
						</p>
					</section>
				</div>
			</div>
		</div>
	);
};

const AI_ARENA_URL = "https://ai-arena.catches.ai/garments-qc";

const AIArenaModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
	const steps = [
		{
			title: "Choose the brand tenant",
			body: 'Select the tenant for the brand. If "AI ARENA" is not visible, click Add AI Arena Tenant first.',
		},
		{
			title: "Select the garment",
			body: "Pick the garment you want to test. The batch tool will generate every size for the selected garment.",
		},
		{
			title: "Choose mannequins",
			body: "Select as many mannequins as needed. More mannequins and more garment sizes means more generated images.",
		},
		{
			title: "Trigger and confirm",
			body: "Click Trigger Bulk Job, review the preview count, then click Confirm and Run when the image volume looks right.",
		},
	];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3">
			<div className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-lg bg-white shadow-2xl border border-monstera-200">
				<div className="flex items-center justify-between gap-3 border-b border-monstera-200 bg-monstera-50 px-4 py-3">
					<div>
						<p className="text-[9px] font-black uppercase tracking-[0.3em] text-monstera-500">
							Batch Testing
						</p>
						<h2 className="text-lg font-black text-ink">Test in AI Arena</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="min-h-10 px-3 rounded-md border border-monstera-200 bg-white text-[9px] font-black uppercase tracking-widest text-monstera-700 hover:border-ink hover:text-ink active:scale-[0.96] transition-transform"
					>
						Close
					</button>
				</div>

				<div className="max-h-[calc(88vh-76px)] overflow-y-auto custom-scrollbar p-4 space-y-4 bg-paper">
					<section className="rounded-lg border border-monstera-200 bg-white p-4 shadow-sm">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div className="space-y-1">
								<h3 className="text-sm font-black uppercase tracking-widest text-ink">
									Open the batch QC tool
								</h3>
								<p className="text-sm font-medium leading-relaxed text-monstera-800">
									Use AI Arena to test prompt changes across real garment sizes
									and mannequins before moving approved updates into production.
								</p>
							</div>
							<button
								type="button"
								onClick={() =>
									window.open(AI_ARENA_URL, "_blank", "noopener,noreferrer")
								}
								className="min-h-11 shrink-0 px-4 rounded-md border border-ink bg-ink text-white text-[10px] font-black uppercase tracking-widest shadow-[3px_3px_0_rgba(0,0,0,0.18)] hover:bg-monstera-800 active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
							>
								Open AI Arena
							</button>
						</div>
					</section>

					<section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
						<p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
							Important development note
						</p>
						<p className="mt-2 text-xs font-bold leading-relaxed text-amber-900">
							The AI Arena batch tool runs against the development environment,
							so it tests prompts that are in development, not production.
							Development is refreshed from production every 24 hours. Once you
							find the prompt you want, update production too, or the development
							change may be overwritten on the next refresh.
						</p>
					</section>

					<section className="grid gap-3">
						{steps.map((step, index) => (
							<article
								key={step.title}
								className="flex gap-3 rounded-lg border border-monstera-200 bg-white p-4 shadow-sm"
							>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-black text-white">
									{index + 1}
								</div>
								<div className="space-y-1">
									<h4 className="text-sm font-black text-ink">{step.title}</h4>
									<p className="text-xs font-bold leading-relaxed text-monstera-700">
										{step.body}
									</p>
								</div>
							</article>
						))}
					</section>

					<section className="rounded-lg border border-monstera-200 bg-monstera-50 p-4">
						<p className="text-[10px] font-black uppercase tracking-widest text-ink">
							Volume reminder
						</p>
						<p className="mt-2 text-xs font-bold leading-relaxed text-monstera-800">
							The preview step tells you how many images will be generated. Check
							that number carefully before confirming, especially for garments
							with many sizes or tests across several mannequins.
						</p>
					</section>
				</div>
			</div>
		</div>
	);
};

export const GarmentPromptLabPage: React.FC = () => {
	const [storedState] = useState(readStoredState);
	const [sourceImage, setSourceImage] = useState<SourceImage | null>(null);
	const [garmentMode, setGarmentMode] = useState<GarmentMode>(
		storedState.garmentMode,
	);
	const [analysis, setAnalysis] = useState<GarmentAnalysis | null>(
		storedState.analysis,
	);
	const [toggles, setToggles] = useState<PromptBuilderToggles>(
		storedState.toggles,
	);
	const [editablePrompts, setEditablePrompts] = useState<
		Record<number, EditablePrompt>
	>({});
	const [generatedImages, setGeneratedImages] = useState<
		PromptLabGeneratedImage[]
	>([]);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copiedLevel, setCopiedLevel] = useState<number | null>(null);
	const [copiedToken, setCopiedToken] = useState<string | null>(null);
	const [showPromptGuidelines, setShowPromptGuidelines] = useState(true);
	const [showQualityChecklist, setShowQualityChecklist] = useState(false);
	const [showAIArena, setShowAIArena] = useState(false);

	useEffect(() => {
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ analysis, toggles, garmentMode }),
		);
	}, [analysis, toggles, garmentMode]);

	const promptLevels = useMemo(
		() => (analysis ? buildPromptLevels(analysis, toggles) : []),
		[analysis, toggles],
	);

	const analysisTokens = useMemo(() => {
		if (!analysis) return [];

		const tokens: { group: string; value: string }[] = [];
		const addToken = (group: string, value: string) => {
			const trimmed = value.trim();
			if (trimmed) tokens.push({ group, value: trimmed });
		};
		const addList = (group: string, values: string[]) => {
			values.forEach((value) => addToken(group, value));
		};

		addToken("Type", analysis.baseGarment);
		if (analysis.garmentSubtype !== analysis.baseGarment) {
			addToken("Subtype", analysis.garmentSubtype);
		}
		addToken("Mode", analysis.classification);
		addList("Color", analysis.colors);
		addList("Pattern", analysis.patterns);
		addList("Material", analysis.materials);
		addList("Fit", analysis.fitDescriptors);
		addList("Silhouette", analysis.silhouette);
		addList("Construction", analysis.constructionDetails);
		addList("Detail", analysis.distinctiveDetails);
		addList("Visibility", analysis.visibilityNotes);

		return tokens;
	}, [analysis]);

	const imageInput = useMemo<ImageInput | null>(
		() =>
			sourceImage
				? { data: sourceImage.url, mimeType: sourceImage.file.type }
				: null,
		[sourceImage],
	);

	const handleImageSelected = (files: File[]) => {
		const file = files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			if (typeof event.target?.result === "string") {
				setSourceImage({
					id: Math.random().toString(36).slice(2),
					url: event.target.result,
					file,
				});
				setError(null);
			}
		};
		reader.readAsDataURL(file);
	};

	const handleModeChange = (mode: GarmentMode) => {
		setGarmentMode(mode);
		setToggles(getDefaultPromptToggles(mode));
		setEditablePrompts({});
	};

	const handleAnalyze = async () => {
		if (!imageInput) return;
		setIsAnalyzing(true);
		setError(null);
		setEditablePrompts({});
		try {
			const nextAnalysis = await analyzeGarmentForPromptLab(
				imageInput,
				garmentMode,
			);
			setAnalysis(nextAnalysis);
			setToggles(getDefaultPromptToggles(nextAnalysis.classification));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Analysis failed");
		} finally {
			setIsAnalyzing(false);
		}
	};

	const handleGenerateImages = async () => {
		if (!imageInput || !analysis) return;
		const shots: PromptLabShotKind[] = ["offBody", "onBody"];
		const runId = Date.now().toString();
		setIsGenerating(true);
		setError(null);
		setGeneratedImages(
			shots.map((kind) => ({
				id: `${runId}-${kind}`,
				kind,
				label: shotLabels[kind],
				status: "loading",
			})),
		);

		await Promise.all(
			shots.map(async (kind) => {
				try {
					const result = await generatePromptLabProductShot(
						kind,
						imageInput,
						analysis,
					);
					setGeneratedImages((current) =>
						current.map((image) =>
							image.kind === kind
								? { ...image, status: "success", url: result.imageBase64 }
								: image,
						),
					);
				} catch (err) {
					setGeneratedImages((current) =>
						current.map((image) =>
							image.kind === kind
								? {
										...image,
										status: "error",
										error:
											err instanceof Error
												? err.message
												: "Generation failed",
								  }
								: image,
						),
					);
				}
			}),
		);
		setIsGenerating(false);
	};

	const handleRegenerateImage = async (kind: PromptLabShotKind) => {
		if (!imageInput || !analysis) return;
		const runId = Date.now().toString();
		setIsGenerating(true);
		setError(null);
		setGeneratedImages((current) =>
			current.map((image) =>
				image.kind === kind
					? {
							id: `${runId}-${kind}`,
							kind,
							label: shotLabels[kind],
							status: "loading",
					  }
					: image,
			),
		);

		try {
			const result = await generatePromptLabProductShot(
				kind,
				imageInput,
				analysis,
			);
			setGeneratedImages((current) =>
				current.map((image) =>
					image.kind === kind
						? { ...image, status: "success", url: result.imageBase64 }
						: image,
				),
			);
		} catch (err) {
			setGeneratedImages((current) =>
				current.map((image) =>
					image.kind === kind
						? {
								...image,
								status: "error",
								error:
									err instanceof Error ? err.message : "Generation failed",
						  }
						: image,
				),
			);
		} finally {
			setIsGenerating(false);
		}
	};

	const updateToggle = (key: keyof PromptBuilderToggles, checked: boolean) => {
		setToggles((current) => ({ ...current, [key]: checked }));
	};

	const handlePromptTextChange = (level: PromptLevel, value: string) => {
		setEditablePrompts((current) => ({
			...current,
			[level.level]: {
				text: value,
			},
		}));
	};

	const handleCopy = async (level: PromptLevel, text: string) => {
		await navigator.clipboard.writeText(text);
		setCopiedLevel(level.level);
		window.setTimeout(() => setCopiedLevel(null), 1200);
	};

	const handleCopyToken = async (token: { group: string; value: string }) => {
		await navigator.clipboard.writeText(token.value);
		const tokenKey = `${token.group}:${token.value}`;
		setCopiedToken(tokenKey);
		window.setTimeout(() => setCopiedToken(null), 1200);
	};

	return (
		<div className="h-screen overflow-y-auto bg-paper text-ink font-sans custom-scrollbar">
			<main className="max-w-[1500px] mx-auto px-3 md:px-4 pt-4 pb-4 space-y-2">
				<header className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-monstera-200 pb-2">
					<div className="flex flex-wrap items-center gap-3">
						<div>
							<p className="text-[10px] font-black uppercase tracking-[0.3em] text-monstera-500">
								Admin Tool
							</p>
							<h1 className="text-xl md:text-2xl font-black tracking-tight text-ink">
								Prompt Lab
							</h1>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={() => setShowQualityChecklist(true)}
								className="min-h-11 px-4 rounded-md border border-ink bg-ink text-white text-[10px] font-black uppercase tracking-widest shadow-[3px_3px_0_rgba(0,0,0,0.18)] hover:bg-monstera-800 active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
							>
								Quality Checklist
							</button>
							<button
								type="button"
								onClick={() => setShowAIArena(true)}
								className="min-h-11 px-4 rounded-md border border-ink bg-white text-ink text-[10px] font-black uppercase tracking-widest shadow-[3px_3px_0_rgba(0,0,0,0.12)] hover:bg-monstera-50 active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
							>
								Test in AI Arena
							</button>
						</div>
					</div>
				</header>

				{error && (
					<div className="border border-red-200 bg-red-50 text-red-700 rounded-md p-3 text-sm font-bold">
						{error}
					</div>
				)}

				<section className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-3 items-start">
					<aside className="space-y-2 lg:sticky lg:top-4">
						<section className="bg-white border border-monstera-200 rounded-md shadow-sm p-2.5 space-y-2">
							<div className="space-y-1.5">
								<label className="text-[9px] font-black uppercase tracking-widest text-monstera-700">
									Garment Type
								</label>
								<div className="grid grid-cols-2 gap-1.5">
									{(["primary", "secondary"] as GarmentMode[]).map((mode) => (
										<button
											key={mode}
											type="button"
											onClick={() => handleModeChange(mode)}
											className={`min-h-10 px-2 py-1.5 rounded-md border text-[9px] font-black uppercase tracking-widest active:scale-[0.96] transition-transform ${
												garmentMode === mode
													? "bg-ink text-white border-ink"
													: "bg-white text-monstera-700 border-monstera-200 hover:border-ink"
											}`}
										>
											{mode}
										</button>
									))}
								</div>
							</div>

							<div className="space-y-2">
								<label className="text-[9px] font-black uppercase tracking-widest text-monstera-700">
									Prompt Toggles
								</label>
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
									<ToggleButton
										label="Color"
										checked={toggles.includeColor}
										onChange={(checked) => updateToggle("includeColor", checked)}
									/>
									<ToggleButton
										label="Pattern"
										checked={toggles.includePattern}
										onChange={(checked) => updateToggle("includePattern", checked)}
									/>
									<ToggleButton
										label="Material"
										checked={toggles.includeMaterial}
										onChange={(checked) => updateToggle("includeMaterial", checked)}
									/>
									<ToggleButton
										label="Fit / Silhouette"
										checked={toggles.includeFit}
										onChange={(checked) => updateToggle("includeFit", checked)}
									/>
									<ToggleButton
										label="Details"
										checked={toggles.includeDetails}
										onChange={(checked) => updateToggle("includeDetails", checked)}
									/>
								</div>
							</div>
						</section>

						<section className="bg-white border border-monstera-200 rounded-md shadow-sm p-2.5 space-y-2">
							<button
								type="button"
								onClick={handleAnalyze}
								disabled={!sourceImage || isAnalyzing}
								className="w-full min-h-10 px-3 py-2 rounded-md bg-white border border-monstera-200 text-[10px] font-black uppercase tracking-widest shadow-sm hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96] transition-transform"
							>
								{isAnalyzing ? "Analyzing Prompts..." : "Analyze Prompts"}
							</button>
							<button
								type="button"
								onClick={handleGenerateImages}
								disabled={!analysis || !sourceImage || isGenerating}
								className="w-full min-h-10 px-3 py-2 rounded-md bg-ink text-white border border-ink text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-monstera-800 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96] transition-transform"
							>
								{isGenerating ? "Generating..." : "Generate Images"}
							</button>
						</section>

						<section className="bg-white border border-monstera-200 rounded-md shadow-sm p-2.5 space-y-2">
							<label className="text-[9px] font-black uppercase tracking-widest text-monstera-700">
								Reference Image
							</label>
							{sourceImage ? (
								<div className="space-y-2">
									<div className="rounded-md overflow-hidden bg-monstera-50 border border-monstera-200 flex items-center justify-center">
										<img
											src={sourceImage.url}
											className="w-full max-h-[250px] object-contain outline outline-1 outline-black/10"
											alt=""
										/>
									</div>
									<button
										type="button"
										onClick={() => setSourceImage(null)}
										className="w-full min-h-9 px-3 py-1.5 rounded-md border border-monstera-200 text-[9px] font-black uppercase tracking-widest hover:border-red-300 hover:text-red-600 active:scale-[0.96] transition-transform"
									>
										Replace Image
									</button>
								</div>
							) : (
								<ImageUpload
									onImagesSelected={handleImageSelected}
									remainingSlots={1}
								/>
							)}
						</section>
					</aside>

					<section className="space-y-3 min-w-0">
						<div className="flex flex-wrap items-center justify-between gap-2 px-1">
							<div>
								<h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-ink">
									Copy Prompts
								</h2>
								{analysis && (
									<span className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
										{analysis.classification} /{" "}
										{analysis.garmentSubtype || analysis.baseGarment}
									</span>
								)}
							</div>
							<button
								type="button"
								onClick={() => setShowPromptGuidelines(true)}
								className="min-h-9 px-3 rounded-md border border-ink bg-white text-[9px] font-black uppercase tracking-widest text-ink shadow-sm hover:bg-monstera-50 active:scale-[0.96] transition-transform"
							>
								Prompt Guidelines
							</button>
						</div>
						{promptLevels.length > 0 ? (
							<div className="space-y-2">
								{promptLevels.map((level) => (
									<PromptCard
										key={level.level}
										level={level}
										editState={editablePrompts[level.level]}
										onTextChange={handlePromptTextChange}
										onCopy={handleCopy}
										copied={copiedLevel === level.level}
									/>
								))}
							</div>
						) : (
							<div className="bg-white border border-dashed border-monstera-300 rounded-md min-h-[220px] flex items-center justify-center text-center p-6">
								<p className="text-sm font-bold text-monstera-500">
									Upload an image, choose primary or secondary, then analyze prompts.
								</p>
							</div>
						)}

						<section className="space-y-2">
							<h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-ink px-1">
								Generated Shots
							</h2>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{generatedImages.length > 0 ? (
									generatedImages.map((image) => (
										<article
											key={image.id}
											className="bg-white border border-monstera-200 rounded-md overflow-hidden shadow-sm"
										>
											<div className="relative h-[min(56vh,360px)] min-h-[240px] bg-monstera-50 flex items-center justify-center overflow-hidden">
												{image.status === "loading" && (
													<div className="absolute inset-0 flex items-center justify-center">
														<LoadingSpinner />
													</div>
												)}
												{image.status === "success" && image.url && (
													<img
														src={image.url}
														className="absolute inset-0 w-full h-full object-contain outline outline-1 outline-black/10"
														alt=""
													/>
												)}
												{image.status === "error" && (
													<p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-bold text-red-600">
														{image.error}
													</p>
												)}
											</div>
											<div className="px-3 py-2 border-t border-monstera-200 flex items-center justify-between gap-3">
												<span className="text-[11px] font-black text-ink">
													{image.label}
												</span>
												<div className="flex items-center gap-2 shrink-0">
													<button
														type="button"
														onClick={() => handleRegenerateImage(image.kind)}
														disabled={
															!analysis ||
															!sourceImage ||
															image.status === "loading"
														}
														className="text-[9px] font-black uppercase tracking-widest text-monstera-600 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
													>
														{image.status === "loading" ? "Regenerating" : "Regenerate"}
													</button>
													{image.url && (
														<a
															href={image.url}
															download={`${image.kind}-${Date.now()}.jpg`}
															className="text-[9px] font-black uppercase tracking-widest text-monstera-600 hover:text-ink"
														>
															Download
														</a>
													)}
												</div>
											</div>
										</article>
									))
								) : (
									<div className="bg-white border border-dashed border-monstera-300 rounded-md min-h-[140px] flex items-center justify-center text-center p-5">
										<p className="text-xs font-bold text-monstera-500">
											Generate Images creates one off-body shot and one on-body
											crop at 2:3 / 1K.
										</p>
									</div>
								)}
							</div>
						</section>

						<section className="bg-white border border-monstera-200 rounded-md shadow-sm overflow-hidden">
							<div className="px-3 py-1.5 bg-monstera-50 border-b border-monstera-200 flex items-center justify-between">
								<h2 className="text-[10px] font-black uppercase tracking-widest text-monstera-700">
									Analysis Tokens
								</h2>
								{analysis && (
									<span className="text-[9px] font-black uppercase tracking-widest text-monstera-500">
										Click to copy
									</span>
								)}
							</div>
							{analysisTokens.length > 0 ? (
								<div className="p-3 flex flex-wrap gap-2">
									{analysisTokens.map((token, index) => {
										const tokenKey = `${token.group}:${token.value}`;
										return (
											<button
												key={`${tokenKey}-${index}`}
												type="button"
												onClick={() => handleCopyToken(token)}
												className="group max-w-full rounded-full border border-monstera-200 bg-monstera-50 px-2.5 py-1.5 text-left hover:border-ink hover:bg-white active:scale-[0.96] transition-transform"
												title={`Copy ${token.value}`}
											>
												<span className="mr-1.5 text-[8px] font-black uppercase tracking-widest text-monstera-500 group-hover:text-monstera-700">
													{copiedToken === tokenKey ? "Copied" : token.group}
												</span>
												<span className="text-[11px] font-black text-ink">
													{token.value}
												</span>
											</button>
										);
									})}
								</div>
							) : (
								<div className="min-h-[96px] flex items-center justify-center p-5 text-center">
									<p className="text-xs font-bold text-monstera-500">
										Analysis tokens will appear here after Analyze Prompts.
									</p>
								</div>
							)}
						</section>
					</section>
				</section>
			</main>
			{showPromptGuidelines && (
				<PromptGuidelinesModal
					onClose={() => setShowPromptGuidelines(false)}
				/>
			)}
			{showQualityChecklist && (
				<QualityChecklistModal
					onClose={() => setShowQualityChecklist(false)}
				/>
			)}
			{showAIArena && <AIArenaModal onClose={() => setShowAIArena(false)} />}
		</div>
	);
};

export default GarmentPromptLabPage;
