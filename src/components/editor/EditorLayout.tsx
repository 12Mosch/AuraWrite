import type React from "react";
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
			{/* Menu Bar with compact status on the right */}
			{showMenuBar && (
				<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
					<div className="flex items-center justify-between">
						<EditorMenuBar
							onAction={onMenuAction}
							documentTitle={documentTitle}
							onSignOut={onSignOut}
						/>
						{showStatusBar && (
							<div className="px-3 py-1">
								<EditorStatusBar
									isModified={documentStatus.isModified}
									lastSaved={documentStatus.lastSaved}
									syncStatus={documentStatus.syncStatus}
								/>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Toolbar */}
			{showToolbar && (
				<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[40px] z-20">
					<EditorToolbar
						onAction={onToolbarAction}
						activeFormats={activeFormats}
						currentAlignment={activeFormats?.alignment}
						currentFontSize={activeFormats?.fontSize}
						currentFontFamily={activeFormats?.fontFamily}
					/>
				</div>
			)}

			{/* Main Editor Area */}
			<div className="flex-1 overflow-hidden">
				<div className="h-full">{children}</div>
			</div>
		</div>
	);
};

export default EditorLayout;
