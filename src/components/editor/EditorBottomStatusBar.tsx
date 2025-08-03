import type React from "react";
import { cn } from "@/lib/utils";

interface EditorBottomStatusBarProps {
	/** Total word count of the document */
	totalWordCount: number;
	/** Total character count excluding spaces (optional, for reading time/char stats) */
	totalCharsNoSpaces?: number;
	/** Total character count including spaces (optional) */
	totalCharsWithSpaces?: number;
	/** Word count of selected text (0 if no selection) */
	selectedWordCount: number;
	/** Selected character count excluding spaces (optional) */
	selectedCharsNoSpaces?: number;
	/** Selected character count including spaces (optional) */
	selectedCharsWithSpaces?: number;
	/** Current cursor line number (1-indexed) */
	cursorLine: number;
	/** Current cursor column number (1-indexed) */
	cursorColumn: number;
	/** Whether text is currently selected */
	hasSelection: boolean;
	/** Optional className for styling */
	className?: string;
	/** Show character counts (with/without spaces) */
	showCharCount?: boolean;
	/** Show estimated reading time */
	showReadingTime?: boolean;
	/** Words-per-minute used to estimate reading time (default 200, typical adult reading speed) */
	readingWPM?: number;
	/** Enable live announcements for screen readers (default: true) */
	enableLiveAnnouncements?: boolean;
	/** Use verbose descriptions for screen readers (default: true) */
	verboseAccessibility?: boolean;
}

/**
 * Generate accessible label for word count section
 */
const generateWordCountLabel = (
	hasSelection: boolean,
	selectedWordCount: number,
	totalWordCount: number,
	verbose = true,
): string => {
	if (hasSelection && selectedWordCount > 0) {
		if (verbose) {
			return `Selection contains ${selectedWordCount} ${selectedWordCount === 1 ? "word" : "words"}`;
		}
		return `Selection: ${selectedWordCount} word${selectedWordCount === 1 ? "" : "s"}`;
	}

	if (verbose) {
		return `Document contains ${totalWordCount} ${totalWordCount === 1 ? "word" : "words"}`;
	}
	return `Words: ${totalWordCount}`;
};

/**
 * Generate accessible label for cursor position
 */
const generateCursorPositionLabel = (
	line: number,
	column: number,
	verbose = true,
): string => {
	if (verbose) {
		return `Cursor positioned at line ${line}, column ${column}`;
	}
	return `Line ${line}, Column ${column}`;
};

/**
 * Generate comprehensive status bar description for screen readers
 */
const generateStatusBarLabel = (
	totalWordCount: number,
	selectedWordCount: number,
	hasSelection: boolean,
	cursorLine: number,
	cursorColumn: number,
	showCharCount: boolean,
	showReadingTime: boolean,
	totalCharsNoSpaces?: number,
	totalCharsWithSpaces?: number,
	selectedCharsNoSpaces?: number,
	selectedCharsWithSpaces?: number,
	readingTimeText?: string | null,
): string => {
	const parts: string[] = [];

	// Word count information
	parts.push(
		generateWordCountLabel(
			hasSelection,
			selectedWordCount,
			totalWordCount,
			true,
		),
	);

	// Character count information
	if (showCharCount) {
		if (hasSelection && selectedWordCount > 0) {
			if (typeof selectedCharsNoSpaces === "number") {
				parts.push(
					`${selectedCharsNoSpaces} characters excluding spaces in selection`,
				);
			}
			if (typeof selectedCharsWithSpaces === "number") {
				parts.push(`${selectedCharsWithSpaces} total characters in selection`);
			}
		} else {
			if (typeof totalCharsNoSpaces === "number") {
				parts.push(
					`${totalCharsNoSpaces} characters excluding spaces in document`,
				);
			}
			if (typeof totalCharsWithSpaces === "number") {
				parts.push(`${totalCharsWithSpaces} total characters in document`);
			}
		}
	}

	// Reading time information
	if (showReadingTime && readingTimeText) {
		const target =
			hasSelection && selectedWordCount > 0 ? "selection" : "document";
		parts.push(`Estimated reading time for ${target}: ${readingTimeText}`);
	}

	// Cursor position
	parts.push(generateCursorPositionLabel(cursorLine, cursorColumn, true));

	return parts.join(". ");
};

/**
 * Status bar component that appears below the text editor
 * Shows word count and cursor position information with enhanced accessibility
 */
export const EditorBottomStatusBar: React.FC<EditorBottomStatusBarProps> = ({
	totalWordCount,
	totalCharsNoSpaces,
	totalCharsWithSpaces,
	selectedWordCount,
	selectedCharsNoSpaces,
	selectedCharsWithSpaces,
	cursorLine,
	cursorColumn,
	hasSelection,
	className,
	showCharCount = false,
	showReadingTime = false,
	readingWPM = 200,
	enableLiveAnnouncements = true,
	verboseAccessibility = true,
}) => {
	// Format word count display (visual)
	const wordCountText = generateWordCountLabel(
		hasSelection,
		selectedWordCount,
		totalWordCount,
		false,
	);

	// Character details (optional)
	const charParts: string[] = [];
	if (showCharCount) {
		if (hasSelection && selectedWordCount > 0) {
			if (typeof selectedCharsNoSpaces === "number") {
				charParts.push(`${selectedCharsNoSpaces} chars (no spaces)`);
			}
			if (typeof selectedCharsWithSpaces === "number") {
				charParts.push(`${selectedCharsWithSpaces} chars`);
			}
		} else {
			if (typeof totalCharsNoSpaces === "number") {
				charParts.push(`${totalCharsNoSpaces} chars (no spaces)`);
			}
			if (typeof totalCharsWithSpaces === "number") {
				charParts.push(`${totalCharsWithSpaces} chars`);
			}
		}
	}

	// Estimated reading time (optional) based on words
	// Enhanced calculation with better accuracy and formatting
	let readingTimeText: string | null = null;
	if (showReadingTime) {
		const wordsForEstimate =
			hasSelection && selectedWordCount > 0
				? selectedWordCount
				: totalWordCount;

		if (wordsForEstimate > 0 && readingWPM > 0) {
			const totalMinutes = wordsForEstimate / readingWPM;

			if (totalMinutes < 0.5) {
				readingTimeText = "<1 min read";
			} else if (totalMinutes < 1) {
				readingTimeText = "1 min read";
			} else if (totalMinutes < 60) {
				// Round to nearest minute for times under 1 hour
				const minutes = Math.round(totalMinutes);
				readingTimeText = `${minutes} min read`;
			} else {
				// For longer texts, show hours and minutes
				const hours = Math.floor(totalMinutes / 60);
				const minutes = Math.round(totalMinutes % 60);
				if (minutes === 0) {
					readingTimeText = `${hours}h read`;
				} else {
					readingTimeText = `${hours}h ${minutes}m read`;
				}
			}
		} else {
			readingTimeText = null;
		}
	}

	// Compose left-side primary text and tooltip
	const leftPrimary = wordCountText;
	const leftDetail = [
		...charParts,
		...(readingTimeText ? [readingTimeText] : []),
	].join(" • ");
	const leftTitle = leftDetail
		? `${wordCountText} • ${leftDetail}`
		: wordCountText;

	// Format cursor position display (visual)
	const cursorPositionText = generateCursorPositionLabel(
		cursorLine,
		cursorColumn,
		false,
	);

	// Generate comprehensive accessibility labels
	const statusBarAriaLabel = generateStatusBarLabel(
		totalWordCount,
		selectedWordCount,
		hasSelection,
		cursorLine,
		cursorColumn,
		showCharCount,
		showReadingTime,
		totalCharsNoSpaces,
		totalCharsWithSpaces,
		selectedCharsNoSpaces,
		selectedCharsWithSpaces,
		readingTimeText,
	);

	const wordCountAriaLabel = generateWordCountLabel(
		hasSelection,
		selectedWordCount,
		totalWordCount,
		verboseAccessibility,
	);
	const cursorPositionAriaLabel = generateCursorPositionLabel(
		cursorLine,
		cursorColumn,
		verboseAccessibility,
	);

	return (
		<output
			aria-label={statusBarAriaLabel}
			aria-live={enableLiveAnnouncements ? "polite" : "off"}
			aria-atomic="false"
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
				// Improve narrow viewport behavior: allow wrapping on small screens, prevent on sm+
				"flex-wrap sm:flex-nowrap",
				className,
			)}
		>
			{/* Left side: Word/Selection + optional details */}
			<section
				className="flex items-center min-w-0 basis-full sm:basis-auto gap-2"
				aria-label="Document statistics"
			>
				<span
					title={leftTitle}
					className={cn(
						"font-medium truncate",
						hasSelection && selectedWordCount > 0
							? "text-primary"
							: "text-muted-foreground",
					)}
				>
					{leftPrimary}
					{/* Screen reader only content for detailed description */}
					<span className="sr-only">. {wordCountAriaLabel}</span>
				</span>

				{leftDetail && (
					<span
						title={leftDetail}
						className="hidden sm:inline text-muted-foreground truncate max-w-[40vw]"
					>
						• {leftDetail}
						{/* Screen reader only content for additional context */}
						<span className="sr-only">
							. Additional statistics: {leftDetail}
						</span>
					</span>
				)}
			</section>

			{/* Right side: Cursor position */}
			<section
				className="flex items-center flex-shrink-0 basis-full sm:basis-auto sm:justify-end"
				aria-label="Cursor position"
			>
				<span className="font-medium text-muted-foreground whitespace-nowrap">
					{cursorPositionText}
					{/* Screen reader only content for detailed description */}
					<span className="sr-only">. {cursorPositionAriaLabel}</span>
				</span>
			</section>
		</output>
	);
};

export default EditorBottomStatusBar;
