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
import type { MenuActionHandler } from "./types";

interface EditorMenuBarProps {
	onAction?: MenuActionHandler;
	documentTitle?: string;
	onSignOut?: () => void;
}

export const EditorMenuBar: React.FC<EditorMenuBarProps> = ({
	onAction,
	documentTitle = "Untitled Document",
	onSignOut,
}) => {
	const handleAction: MenuActionHandler = (action, data) => {
		onAction?.(action, data);
	};

	return (
		<div className="flex items-center justify-between px-3 sm:px-4 py-2">
			<div className="flex items-center gap-4">
				<div className="flex items-center gap-2">
					<FileText className="h-5 w-5 text-blue-600" />
					<span className="font-semibold text-sm">AuraWrite</span>
				</div>

				<Menubar className="border-none bg-transparent [&_[data-radix-menubar-trigger]]:focus-visible:ring-2 [&_[data-radix-menubar-trigger]]:focus-visible:ring-ring [&_[data-radix-menubar-trigger]]:rounded-sm">
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
							<MenubarItem onClick={() => handleAction("view.toggleStatusBar")}>
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
			</div>

			{/* Document Title */}
			<div className="flex-1 text-center">
				<span className="text-sm font-medium text-foreground">
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
				>
					<Settings className="h-4 w-4" />
				</Button>
				{onSignOut && (
					<Button
						variant="destructive"
						type="button"
						onClick={onSignOut}
						title="Sign Out"
						className="gap-2"
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
