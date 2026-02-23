import React from "react";

export const Header: React.FC = () => {
	return (
		<div className="flex items-center gap-3 bg-ink px-6 py-1 w-full select-none shrink-0">
			<h1 className="text-sm md:text-sm font-serif font-bold text-white tracking-tight leading-none whitespace-nowrap">
				CATCHES
			</h1>
		</div>
	);
};
