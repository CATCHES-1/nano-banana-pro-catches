import React from "react";

export const Header: React.FC = () => {
	return (
		<div className="flex items-center gap-3 bg-ink px-6 py-5 w-full select-none shrink-0">
			<div className="w-8 h-8">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="lucide lucide-sparkles text-monstera-400 w-full h-full"
					aria-hidden="true"
				>
					<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
					<path d="M20 3v4"></path>
					<path d="M22 5h-4"></path>
					<path d="M4 17v2"></path>
					<path d="M5 18H3"></path>
				</svg>
			</div>
			<h1 className="text-lg md:text-xl font-serif font-bold text-white tracking-tight leading-none whitespace-nowrap">
				CATCHES
			</h1>
		</div>
	);
};
