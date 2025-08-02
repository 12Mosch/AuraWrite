import type React from "react";
import { Card } from "@/components/ui/card";
import { EditorMenuBar } from "./EditorMenuBar";
import { EditorStatusBar } from "./EditorStatusBar";
import { EditorToolbar } from "./EditorToolbar";
import type {
	ActiveFormats,
	DocumentStatus,
	MenuActionHandler,
	ToolbarActionHandler,
} from "./types";

interface EditorLayoutProps {
	children: React.ReactNode;
	className?: string;
	showMenuBar?: boolean;
	showToolbar?: boolean;
	showStatusBar?: boolean;
	onMenuAction?: MenuActionHandler;
	onToolbarAction?: ToolbarActionHandler;
	onSignOut?: () => void;
	documentTitle?: string;
	documentStatus?: DocumentStatus;
	activeFormats?: ActiveFormats;
}

export const EditorLayout: React.FC<EditorLayoutProps> = ({
	children,
	className = "",
	showMenuBar = true,
	showToolbar = true,
	showStatusBar = true,
	onMenuAction,
	onToolbarAction,
	onSignOut,
	documentTitle = "Untitled Document",
	documentStatus = {},
	activeFormats = {},
}) => {
	return (
		<div className={`editor-layout flex flex-col h-full ${className}`}>
			{/* Menu Bar */}
			{showMenuBar && (
				<div className="border-b bg-background">
					<EditorMenuBar
						onAction={onMenuAction}
						documentTitle={documentTitle}
						onSignOut={onSignOut}
					/>
				</div>
			)}

			{/* Toolbar */}
			{showToolbar && (
				<div className="border-b bg-background">
					<EditorToolbar
						onAction={onToolbarAction}
						activeFormats={activeFormats}
						currentFontSize={activeFormats.fontSize}
						currentFontFamily={activeFormats.fontFamily}
					/>
				</div>
			)}

			{/* Main Editor Area */}
			<div className="flex-1 overflow-hidden">
				<Card className="h-full border-0 rounded-none">
					<div className="h-full p-0">{children}</div>
				</Card>
			</div>

			{/* Status Bar */}
			{showStatusBar && (
				<div className="border-t bg-background">
					<EditorStatusBar
						wordCount={documentStatus.wordCount}
						characterCount={documentStatus.characterCount}
						isModified={documentStatus.isModified}
						lastSaved={documentStatus.lastSaved}
						syncStatus={documentStatus.syncStatus}
					/>
				</div>
			)}
		</div>
	);
};

export default EditorLayout;
