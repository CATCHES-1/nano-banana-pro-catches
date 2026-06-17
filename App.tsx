import React, { useEffect, useState } from "react";
import { GeneratorPage } from "./features/generator/GeneratorPage.tsx";
import { GarmentPromptLabPage } from "./features/garmentPromptLab/GarmentPromptLabPage.tsx";

type AppTab = "generator" | "prompt-lab";

const getTabFromHash = (): AppTab =>
	window.location.hash === "#prompt-lab" ? "prompt-lab" : "generator";

const App: React.FC = () => {
	const [activeTab, setActiveTab] = useState<AppTab>(getTabFromHash);

	useEffect(() => {
		const handleHashChange = () => setActiveTab(getTabFromHash());
		window.addEventListener("hashchange", handleHashChange);
		if (!window.location.hash) {
			window.history.replaceState(null, "", "#generator");
		}
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	const selectTab = (tab: AppTab) => {
		window.location.hash = tab;
		setActiveTab(tab);
	};

	return (
		<div className="relative h-screen overflow-hidden bg-white">
			<nav className="fixed top-2 right-2 z-[100] bg-white/95 backdrop-blur border border-monstera-200 rounded-md shadow-lg p-1 flex items-center gap-1">
				<button
					type="button"
					onClick={() => selectTab("generator")}
					className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
						activeTab === "generator"
							? "bg-ink text-white"
							: "text-monstera-600 hover:text-ink hover:bg-monstera-50"
					}`}
				>
					Generator
				</button>
				<button
					type="button"
					onClick={() => selectTab("prompt-lab")}
					className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
						activeTab === "prompt-lab"
							? "bg-ink text-white"
							: "text-monstera-600 hover:text-ink hover:bg-monstera-50"
					}`}
				>
					Prompt Lab
				</button>
			</nav>

			{activeTab === "prompt-lab" ? <GarmentPromptLabPage /> : <GeneratorPage />}
		</div>
	);
};

export default App;
