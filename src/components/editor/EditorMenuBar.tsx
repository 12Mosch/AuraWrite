import {
	Clipboard,
	Copy,
	Download,
	FileText,
	HelpCircle,
	LogOut,
	Redo,
	Save,
	Scissors,
	Search,
	Settings,
	Undo,
	Upload,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Menubar,
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarSeparator,
	MenubarShortcut,
	MenubarTrigger,
} from "@/components/ui/menubar";
import { isElectron } from "@/utils/environment";
import type { MenuAction, MenuActionHandler } from "./types";

interface EditorMenuBarProps {
	onAction?: MenuActionHandler;
	documentTitle?: string;
	onSignOut?: () => void;
}

// Define window interface for Electron API
interface WindowWithElectronAPI extends Window {
	electronAPI?: {
		onMenuAction: (callback: (action: string) => void) => void;
		removeMenuActionListener: (callback: (action: string) => void) => void;
	};
}

export const EditorMenuBar: React.FC<EditorMenuBarProps> = ({
	onAction,
	documentTitle = "Untitled Document",
	onSignOut,
}) => {
	const handleAction: MenuActionHandler = useCallback(
		(action, data) => {
			onAction?.(action, data);
		},
		[onAction],
	);

	// Set up menu action listener for Electron
	useEffect(() => {
		const electronWindow = window as WindowWithElectronAPI;
		if (isElectron() && electronWindow.electronAPI?.onMenuAction) {
			const handleMenuAction = (action: string) => {
				handleAction(action as MenuAction);
			};

			electronWindow.electronAPI.onMenuAction(handleMenuAction);

			return () => {
				if (electronWindow.electronAPI?.removeMenuActionListener) {
					electronWindow.electronAPI.removeMenuActionListener(handleMenuAction);
				}
			};
		}
	}, [handleAction]);

	const showMenus = !isElectron();

	return (
		<div className="flex items-center justify-between px-2 sm:px-3 py-1.5 h-10">
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1.5">
					<FileText className="h-5 w-5 text-blue-600" />
					<span className="font-semibold text-sm leading-none">AuraWrite</span>
				</div>

				{showMenus && (
					<Menubar className="h-8 border-none rounded-none bg-transparent p-0 [&_[data-radix-menubar-trigger]]:focus-visible:ring-0 [&_[data-radix-menubar-trigger]]:rounded-none [&_[data-radix-menubar-trigger]]:px-2 [&_[data-radix-menubar-trigger]]:py-1">
						{/* File Menu */}
						<MenubarMenu>
							<MenubarTrigger className="text-sm">File</MenubarTrigger>
							<MenubarContent>
								<MenubarItem onClick={() => handleAction("file.new")}>
									<FileText className="mr-2 h-4 w-4" />
									New Document
									<MenubarShortcut>Ctrl+N</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("file.open")}>
									<Upload className="mr-2 h-4 w-4" />
									Open
									<MenubarShortcut>Ctrl+O</MenubarShortcut>
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem onClick={() => handleAction("file.save")}>
									<Save className="mr-2 h-4 w-4" />
									Save
									<MenubarShortcut>Ctrl+S</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("file.saveAs")}>
									Save As...
									<MenubarShortcut>Ctrl+Shift+S</MenubarShortcut>
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem onClick={() => handleAction("file.export")}>
									<Download className="mr-2 h-4 w-4" />
									Export
								</MenubarItem>
							</MenubarContent>
						</MenubarMenu>

						{/* Edit Menu */}
						<MenubarMenu>
							<MenubarTrigger className="text-sm">Edit</MenubarTrigger>
							<MenubarContent>
								<MenubarItem onClick={() => handleAction("edit.undo")}>
									<Undo className="mr-2 h-4 w-4" />
									Undo
									<MenubarShortcut>Ctrl+Z</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("edit.redo")}>
									<Redo className="mr-2 h-4 w-4" />
									Redo
									<MenubarShortcut>Ctrl+Y</MenubarShortcut>
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem onClick={() => handleAction("edit.cut")}>
									<Scissors className="mr-2 h-4 w-4" />
									Cut
									<MenubarShortcut>Ctrl+X</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("edit.copy")}>
									<Copy className="mr-2 h-4 w-4" />
									Copy
									<MenubarShortcut>Ctrl+C</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("edit.paste")}>
									<Clipboard className="mr-2 h-4 w-4" />
									Paste
									<MenubarShortcut>Ctrl+V</MenubarShortcut>
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem onClick={() => handleAction("edit.find")}>
									<Search className="mr-2 h-4 w-4" />
									Find & Replace
									<MenubarShortcut>Ctrl+F</MenubarShortcut>
								</MenubarItem>
							</MenubarContent>
						</MenubarMenu>

						{/* View Menu */}
						<MenubarMenu>
							<MenubarTrigger className="text-sm">View</MenubarTrigger>
							<MenubarContent>
								<MenubarItem onClick={() => handleAction("view.toggleToolbar")}>
									Toggle Toolbar
								</MenubarItem>
								<MenubarItem
									onClick={() => handleAction("view.toggleStatusBar")}
								>
									Toggle Status Bar
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem onClick={() => handleAction("view.zoomIn")}>
									Zoom In
									<MenubarShortcut>Ctrl++</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("view.zoomOut")}>
									Zoom Out
									<MenubarShortcut>Ctrl+-</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("view.resetZoom")}>
									Reset Zoom
									<MenubarShortcut>Ctrl+0</MenubarShortcut>
								</MenubarItem>
							</MenubarContent>
						</MenubarMenu>

						{/* Format Menu */}
						<MenubarMenu>
							<MenubarTrigger className="text-sm">Format</MenubarTrigger>
							<MenubarContent>
								<MenubarItem onClick={() => handleAction("format.bold")}>
									Bold
									<MenubarShortcut>Ctrl+B</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("format.italic")}>
									Italic
									<MenubarShortcut>Ctrl+I</MenubarShortcut>
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("format.underline")}>
									Underline
									<MenubarShortcut>Ctrl+U</MenubarShortcut>
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem onClick={() => handleAction("format.blockquote")}>
									Quote
									<MenubarShortcut>Ctrl+Shift+Q</MenubarShortcut>
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem onClick={() => handleAction("format.alignLeft")}>
									Align Left
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("format.alignCenter")}>
									Align Center
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("format.alignRight")}>
									Align Right
								</MenubarItem>
							</MenubarContent>
						</MenubarMenu>

						{/* Help Menu */}
						<MenubarMenu>
							<MenubarTrigger className="text-sm">Help</MenubarTrigger>
							<MenubarContent>
								<MenubarItem onClick={() => handleAction("help.about")}>
									<HelpCircle className="mr-2 h-4 w-4" />
									About AuraWrite
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("help.shortcuts")}>
									Keyboard Shortcuts
								</MenubarItem>
								<MenubarItem onClick={() => handleAction("help.documentation")}>
									Documentation
								</MenubarItem>
							</MenubarContent>
						</MenubarMenu>
					</Menubar>
				)}
			</div>

			{/* Document Title */}
			<div className="flex-1 flex items-center justify-center">
				<span className="text-sm font-medium leading-none text-foreground">
					{documentTitle}
				</span>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					type="button"
					onClick={() => handleAction("settings.open")}
					title="Settings"
					className="h-8 w-8"
				>
					<Settings className="h-4 w-4" />
				</Button>
				{onSignOut && (
					<Button
						variant="destructive"
						type="button"
						onClick={onSignOut}
						title="Sign Out"
						className="gap-1.5 h-8"
					>
						<LogOut className="h-4 w-4" />
						<span className="hidden sm:inline">Sign Out</span>
					</Button>
				)}
			</div>
		</div>
	);
};

export default EditorMenuBar;
