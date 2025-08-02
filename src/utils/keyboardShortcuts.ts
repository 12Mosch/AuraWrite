import type { Editor } from "slate";
import {
	handleListEnterKey,
	toggleBlock,
	toggleFormat,
} from "./slateFormatting";

/**
 * Keyboard shortcuts handler for the Slate.js editor
 */

/**
 * Check if the current platform is Mac
 */
const isMac = (): boolean => {
	return (
		typeof window !== "undefined" &&
		/Mac|iPod|iPhone|iPad/.test(window.navigator.platform)
	);
};

/**
 * Check if the modifier key (Ctrl on Windows/Linux, Cmd on Mac) is pressed
 */
const isModifierPressed = (
	event: KeyboardEvent | React.KeyboardEvent,
): boolean => {
	return isMac() ? event.metaKey : event.ctrlKey;
};

/**
 * Handle keyboard shortcuts for text formatting
 */
export const handleKeyboardShortcuts = (
	event: KeyboardEvent | React.KeyboardEvent,
	editor: Editor,
): boolean => {
	const { key, shiftKey } = event;
	const modifierPressed = isModifierPressed(event);

	// Handle Enter key for list behavior (without modifier)
	if (key === "Enter" && !modifierPressed && !shiftKey) {
		if (handleListEnterKey(editor)) {
			event.preventDefault();
			return true;
		}
	}

	// Only handle shortcuts when modifier key is pressed
	if (!modifierPressed) {
		return false;
	}

	// Text formatting shortcuts
	switch (key.toLowerCase()) {
		case "b":
			if (!shiftKey) {
				event.preventDefault();
				toggleFormat(editor, "bold");
				return true;
			}
			break;

		case "i":
			if (!shiftKey) {
				event.preventDefault();
				toggleFormat(editor, "italic");
				return true;
			}
			break;

		case "u":
			if (!shiftKey) {
				event.preventDefault();
				toggleFormat(editor, "underline");
				return true;
			}
			break;

		case "x":
			if (shiftKey) {
				event.preventDefault();
				toggleFormat(editor, "strikethrough");
				return true;
			}
			break;

		// List shortcuts
		case "8":
			if (shiftKey) {
				event.preventDefault();
				toggleBlock(editor, "bulleted-list");
				return true;
			}
			break;

		case "7":
			if (shiftKey) {
				event.preventDefault();
				toggleBlock(editor, "numbered-list");
				return true;
			}
			break;

		// Additional useful shortcuts
		case "`":
			if (!shiftKey) {
				event.preventDefault();
				toggleFormat(editor, "code");
				return true;
			}
			break;
	}

	return false;
};

/**
 * Get the keyboard shortcut display text for a given action
 */
export const getShortcutText = (action: string): string => {
	const modifier = isMac() ? "Cmd" : "Ctrl";

	switch (action) {
		case "bold":
			return `${modifier}+B`;
		case "italic":
			return `${modifier}+I`;
		case "underline":
			return `${modifier}+U`;
		case "strikethrough":
			return `${modifier}+Shift+X`;
		case "code":
			return `${modifier}+\``;
		case "bulleted-list":
			return `${modifier}+Shift+8`;
		case "numbered-list":
			return `${modifier}+Shift+7`;
		case "undo":
			return `${modifier}+Z`;
		case "redo":
			return isMac() ? `${modifier}+Shift+Z` : `${modifier}+Y`;
		default:
			return "";
	}
};

/**
 * List of all available keyboard shortcuts
 */
export const KEYBOARD_SHORTCUTS = [
	{
		action: "bold",
		description: "Bold text",
		shortcut: getShortcutText("bold"),
	},
	{
		action: "italic",
		description: "Italic text",
		shortcut: getShortcutText("italic"),
	},
	{
		action: "underline",
		description: "Underline text",
		shortcut: getShortcutText("underline"),
	},
	{
		action: "strikethrough",
		description: "Strikethrough text",
		shortcut: getShortcutText("strikethrough"),
	},
	{
		action: "code",
		description: "Inline code",
		shortcut: getShortcutText("code"),
	},
	{
		action: "bulleted-list",
		description: "Bullet list",
		shortcut: getShortcutText("bulleted-list"),
	},
	{
		action: "numbered-list",
		description: "Numbered list",
		shortcut: getShortcutText("numbered-list"),
	},
	{ action: "undo", description: "Undo", shortcut: getShortcutText("undo") },
	{ action: "redo", description: "Redo", shortcut: getShortcutText("redo") },
];

/**
 * Hook for using keyboard shortcuts in React components
 */
export const useKeyboardShortcuts = (editor: Editor | null) => {
	const handleKeyDown = (event: KeyboardEvent | React.KeyboardEvent) => {
		if (!editor) return false;
		return handleKeyboardShortcuts(event, editor);
	};

	return { handleKeyDown, getShortcutText, KEYBOARD_SHORTCUTS };
};
