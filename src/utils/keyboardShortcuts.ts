import type { Editor } from "slate";
import {
	handleListEnterKey,
	setAlignment,
	toggleBlock,
	toggleFormat,
} from "./slateFormatting";

/**
 * Keyboard shortcuts handler for the Slate.js editor
 */

// Type definition for the User-Agent Client Hints API
interface NavigatorUAData {
	platform: string;
	brands: Array<{ brand: string; version: string }>;
}

interface NavigatorWithUserAgentData extends Navigator {
	userAgentData?: NavigatorUAData;
}

/**
 * Check if the current platform is Mac
 */
const isMac = (): boolean => {
	if (typeof window === "undefined") {
		return false;
	}

	// Try modern API first (User-Agent Client Hints API)
	const navigator = window.navigator as NavigatorWithUserAgentData;
	if (navigator.userAgentData?.platform) {
		return navigator.userAgentData.platform === "macOS";
	}

	// Fallback to user agent string detection (more reliable than deprecated platform)
	return /Mac|iPod|iPhone|iPad/.test(window.navigator.userAgent);
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
	onLinkShortcut?: () => void,
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

		case "q":
			if (shiftKey) {
				event.preventDefault();
				toggleBlock(editor, "blockquote");
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

		case "k":
			if (!shiftKey) {
				event.preventDefault();
				onLinkShortcut?.();
				return true;
			}
			break;

		// Alignment shortcuts (Ctrl+Shift+L/E/R/J)
		case "l":
			if (shiftKey) {
				event.preventDefault();
				setAlignment(editor, "left");
				return true;
			}
			break;

		case "e":
			if (shiftKey) {
				event.preventDefault();
				setAlignment(editor, "center");
				return true;
			}
			break;

		case "r":
			if (shiftKey) {
				event.preventDefault();
				setAlignment(editor, "right");
				return true;
			}
			break;

		case "j":
			if (shiftKey) {
				event.preventDefault();
				setAlignment(editor, "justify");
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
		case "alignLeft":
			return `${modifier}+Shift+L`;
		case "alignCenter":
			return `${modifier}+Shift+E`;
		case "alignRight":
			return `${modifier}+Shift+R`;
		case "alignJustify":
			return `${modifier}+Shift+J`;
		case "link":
			return `${modifier}+K`;
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
	{
		action: "link",
		description: "Insert Link",
		shortcut: getShortcutText("link"),
	},
];

/**
 * Hook for using keyboard shortcuts in React components
 */
export const useKeyboardShortcuts = (
	editor: Editor | null,
	onLinkShortcut?: () => void,
) => {
	const handleKeyDown = (event: KeyboardEvent | React.KeyboardEvent) => {
		if (!editor) return false;
		return handleKeyboardShortcuts(event, editor, onLinkShortcut);
	};

	return { handleKeyDown, getShortcutText, KEYBOARD_SHORTCUTS };
};
