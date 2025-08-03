import type React from "react";
import { cn } from "@/lib/utils";

interface EditorBottomStatusBarProps {
	/** Total word count of the document */
	totalWordCount: number;
	/** Word count of selected text (0 if no selection) */
	selectedWordCount: number;
	/** Current cursor line number (1-indexed) */
	cursorLine: number;
	/** Current cursor column number (1-indexed) */
	cursorColumn: number;
	/** Whether text is currently selected */
	hasSelection: boolean;
	/** Optional className for styling */
	className?: string;
}

/**
 * Status bar component that appears below the text editor
 * Shows word count and cursor position information
 */
export const EditorBottomStatusBar: React.FC<EditorBottomStatusBarProps> = ({
	totalWordCount,
	selectedWordCount,
	cursorLine,
	cursorColumn,
	hasSelection,
	className,
}) => {
	// Format word count display
	const wordCountText =
		hasSelection && selectedWordCount > 0
			? `${selectedWordCount} word${selectedWordCount === 1 ? "" : "s"} selected`
			: `${totalWordCount} word${totalWordCount === 1 ? "" : "s"}`;

	// Format cursor position display
	const cursorPositionText = `Line ${cursorLine}, Column ${cursorColumn}`;

	return (
		<div
			className={cn(
				// Base styling
				"flex items-center justify-between px-4 py-2",
				// Background and borders
				"bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
				"border-t border-border/50",
				// Typography
				"text-xs text-muted-foreground font-medium",
				// Layout
				"sticky bottom-0 z-10",
				// Responsive adjustments
				"gap-4 min-h-[32px]",
				// Shadow for better separation
				"shadow-sm",
				className,
			)}
		>
			{/* Left side: Word count */}
			<div className="flex items-center">
				<span
					className={cn(
						"font-medium",
						hasSelection && selectedWordCount > 0
							? "text-primary"
							: "text-muted-foreground",
					)}
				>
					{wordCountText}
				</span>
			</div>

			{/* Right side: Cursor position */}
			<div className="flex items-center">
				<span className="font-medium text-muted-foreground">
					{cursorPositionText}
				</span>
			</div>
		</div>
	);
};

export default EditorBottomStatusBar;
