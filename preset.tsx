import React, { memo, useState } from "react";
import { PRESET_CONFIGS, PresetConfig } from "./preset.ts";

interface PresetButtonsProps {
	onSelect: (preset: PresetConfig) => void;
}

const PresetButtonsComponent: React.FC<PresetButtonsProps> = ({ onSelect }) => {
	const [activePresetName, setActivePresetName] = useState<string | null>(null);
	const activePreset =
		PRESET_CONFIGS.find((preset) => preset.name === activePresetName) ?? null;

	return (
		<div className="space-y-1.5">
			<label className="text-[9px] text-monstera-800 font-black uppercase tracking-widest px-1 block">
				Presets
			</label>
			<div className="space-y-1 bg-monstera-50 border border-monstera-200 rounded-md p-1">
				<label className="text-[9px] text-monstera-800 font-black uppercase tracking-widest px-1 block">
					Preset Instructions
				</label>
				{activePreset ? (
					<p className="text-[12px] text-monstera-600 font-normal px-1">
						{activePreset.helperText}
					</p>
				) : null}
			</div>
			<div className="grid grid-cols-2 gap-1.5">
				{PRESET_CONFIGS.map((preset) => (
					<button
						key={preset.name}
						type="button"
						onClick={() => {
							setActivePresetName(preset.name);
							onSelect(preset);
						}}
						className={`text-left text-[10px] font-bold px-2.5 py-2 border rounded-md transition-colors active:scale-[0.98] ${
							activePresetName === preset.name
								? "bg-ink text-white border-ink"
								: "bg-monstera-50 border-monstera-200 hover:bg-white hover:border-monstera-300"
						}`}
						title={`${preset.resolution} • ${preset.aspectRatio}`}
					>
						{preset.name}
					</button>
				))}
			</div>
		</div>
	);
};

export const PresetButtons = memo(PresetButtonsComponent);
