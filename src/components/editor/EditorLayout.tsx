import type React from "react";
import { EditorBottomStatusBar } from "./EditorBottomStatusBar";
import { EditorMenuBar } from "./EditorMenuBar";
import { EditorToolbar } from "./EditorToolbar";
import type {
	ActiveFormats,
	DocumentStatus,
	MenuActionHandler,
	SelectionStatus,
	ToolbarActionHandler,
} from "./types";

interface EditorLayoutProps {
	children: React.ReactNode;
	className?: string;
	showMenuBar?: boolean;
	showToolbar?: boolean;
	showStatusBar?: boolean;
	showBottomStatusBar?: boolean;
	onMenuAction?: MenuActionHandler;
	onToolbarAction?: ToolbarActionHandler;
	onSignOut?: () => void;
	documentTitle?: string;
	documentStatus?: DocumentStatus;
	activeFormats?: ActiveFormats;
	selectionStatus?: SelectionStatus;
	// Status bar configuration
	showCharCount?: boolean;
	showReadingTime?: boolean;
	readingWPM?: number;
}

export const EditorLayout: React.FC<EditorLayoutProps> = ({
	children,
	className = "",
	showMenuBar = true,
	showToolbar = true,
	showStatusBar = true,
	showBottomStatusBar = true,
	onMenuAction,
	onToolbarAction,
	onSignOut,
	documentTitle = "Untitled Document",
	documentStatus = {},
	activeFormats = {},
	selectionStatus = {
		line: 1,
		column: 1,
		selectedWordCount: 0,
		hasSelection: false,
	},
	// Status bar configuration
	showCharCount = true,
	showReadingTime = true,
	readingWPM = 200,
}) => {
	return (
		<div className={`editor-layout flex flex-col h-full ${className}`}>
			{/* Menu Bar */}
			{showMenuBar && (
				<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 h-10">
					<EditorMenuBar
						onAction={onMenuAction}
						documentTitle={documentTitle}
						onSignOut={onSignOut}
					/>
				</div>
			)}

			{/* Toolbar */}
			{showToolbar && (
				<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[40px] z-20 h-10">
					<EditorToolbar
						onAction={onToolbarAction}
						activeFormats={activeFormats}
						currentAlignment={activeFormats?.alignment}
						currentFontSize={activeFormats?.fontSize}
						currentFontFamily={activeFormats?.fontFamily}
						showStatusBar={showStatusBar}
						syncStatus={documentStatus.syncStatus}
						isModified={documentStatus.isModified}
						lastSaved={documentStatus.lastSaved}
					/>
				</div>
			)}

			{/* Main Editor Area */}
			<div className="flex-1 overflow-hidden relative">
				<div className="h-full">{children}</div>

				{/* Bottom Status Bar */}
				{showBottomStatusBar && (
					<EditorBottomStatusBar
						totalWordCount={documentStatus.wordCount || 0}
						totalCharsWithSpaces={documentStatus.charsWithSpaces}
						totalCharsNoSpaces={documentStatus.charsWithoutSpaces}
						selectedWordCount={selectionStatus.selectedWordCount}
						selectedCharsWithSpaces={selectionStatus.selectedCharsWithSpaces}
						selectedCharsNoSpaces={selectionStatus.selectedCharsWithoutSpaces}
						cursorLine={selectionStatus.line}
						cursorColumn={selectionStatus.column}
						hasSelection={selectionStatus.hasSelection}
						showCharCount={showCharCount}
						showReadingTime={showReadingTime}
						readingWPM={readingWPM}
					/>
				)}
			</div>
		</div>
	);
};

export default EditorLayout;
