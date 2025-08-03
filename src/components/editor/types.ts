// Common types for the editor components

// Menu action types
export type MenuAction =
	| "file.new"
	| "file.open"
	| "file.save"
	| "file.saveAs"
	| "file.export"
	| "file.print"
	| "edit.undo"
	| "edit.redo"
	| "edit.cut"
	| "edit.copy"
	| "edit.paste"
	| "edit.selectAll"
	| "edit.find"
	| "edit.replace"
	| "format.bold"
	| "format.italic"
	| "format.underline"
	| "format.strikethrough"
	| "format.code"
	| "format.heading1"
	| "format.heading2"
	| "format.heading3"
	| "format.paragraph"
	| "format.blockquote"
	| "format.bulletList"
	| "format.numberList"
	| "format.alignLeft"
	| "format.alignCenter"
	| "format.alignRight"
	| "insert.link"
	| "insert.image"
	| "insert.table"
	| "insert.codeBlock"
	| "view.fullscreen"
	| "view.preview"
	| "view.toggleToolbar"
	| "view.toggleStatusBar"
	| "view.zoomIn"
	| "view.zoomOut"
	| "view.resetZoom"
	| "help.about"
	| "help.shortcuts"
	| "help.documentation"
	| "settings.open";

// Toolbar action types
export type ToolbarAction =
	| "edit.undo"
	| "edit.redo"
	| "format.bold"
	| "format.italic"
	| "format.underline"
	| "format.strikethrough"
	| "format.code"
	| "format.fontSize"
	| "format.fontFamily"
	| "format.color"
	| "format.backgroundColor"
	| "format.alignLeft"
	| "format.alignCenter"
	| "format.alignRight"
	| "format.alignJustify"
	| "format.heading1"
	| "format.heading2"
	| "format.heading3"
	| "format.paragraph"
	| "format.blockquote"
	| "format.bulletList"
	| "format.numberedList"
	| "insert.link"
	| "insert.image"
	| "insert.table"
	| "insert.codeBlock";

// Action data types
export interface FontSizeData {
	fontSize: string;
}

export interface FontFamilyData {
	fontFamily: string;
}

export interface ColorData {
	color: string;
}

export interface LinkData {
	url: string;
	text?: string;
}

export interface ImageData {
	url: string;
	alt?: string;
	width?: number;
	height?: number;
}

// Union type for all possible action data
export type ActionData =
	| FontSizeData
	| FontFamilyData
	| ColorData
	| LinkData
	| ImageData
	| string
	| number
	| boolean
	| null
	| undefined;

// Action handler types
export type MenuActionHandler = (action: MenuAction, data?: ActionData) => void;
export type ToolbarActionHandler = (
	action: ToolbarAction,
	data?: ActionData,
) => void;

// Document status interface
export interface DocumentStatus {
	wordCount?: number;
	characterCount?: number;
	isModified?: boolean;
	lastSaved?: Date;
	syncStatus?:
		| "synced"
		| "syncing"
		| "error"
		| "offline"
		| "pending"
		| "disabled";
}

// Active formats interface
export interface ActiveFormats {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	code?: boolean;
	fontSize?: string;
	fontFamily?: string;
	color?: string;
	backgroundColor?: string;
	alignment?: "left" | "center" | "right" | "justify";
	heading?: 1 | 2 | 3 | 4 | 5 | 6;
	blockType?:
		| "paragraph"
		| "blockquote"
		| "bulleted-list"
		| "numbered-list"
		| "code-block";
}
