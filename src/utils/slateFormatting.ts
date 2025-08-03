import {
	Editor,
	Range,
	Element as SlateElement,
	Text,
	Transforms,
} from "slate";
import type { CustomElement, CustomText, LinkElement } from "../types/slate";

/**
 * Utility functions for Slate.js text formatting operations
 */

// Text formatting marks
export type TextFormat =
	| "bold"
	| "italic"
	| "underline"
	| "strikethrough"
	| "code";

// Alignment formats
export type AlignmentFormat = "left" | "center" | "right" | "justify";

/**
 * Check if a text format is currently active
 */
export const isFormatActive = (editor: Editor, format: TextFormat): boolean => {
	const marks = Editor.marks(editor);
	return marks ? (marks as CustomText)[format] === true : false;
};

/**
 * Toggle a text format (bold, italic, underline, strikethrough, code)
 */
export const toggleFormat = (editor: Editor, format: TextFormat): void => {
	const isActive = isFormatActive(editor, format);

	if (isActive) {
		Editor.removeMark(editor, format);
	} else {
		Editor.addMark(editor, format, true);
	}
};

/**
 * Set font size for selected text
 */
export const setFontSize = (editor: Editor, fontSize: string): void => {
	Editor.addMark(editor, "fontSize", fontSize);
};

/**
 * Set font family for selected text
 */
export const setFontFamily = (editor: Editor, fontFamily: string): void => {
	Editor.addMark(editor, "fontFamily", fontFamily);
};

/**
 * Get current font size from editor marks
 */
export const getCurrentFontSize = (editor: Editor): string | undefined => {
	const marks = Editor.marks(editor);
	return marks?.fontSize;
};

/**
 * Get current font family from editor marks
 */
export const getCurrentFontFamily = (editor: Editor): string | undefined => {
	const marks = Editor.marks(editor);
	return marks?.fontFamily;
};

/**
 * Check if an alignment is currently active
 */
export const isAlignmentActive = (
	editor: Editor,
	alignment: AlignmentFormat,
): boolean => {
	const { selection } = editor;
	if (!selection) return alignment === "left"; // Default to left when no selection

	const [match] = Array.from(
		Editor.nodes(editor, {
			at: Editor.unhangRange(editor, selection),
			match: (n) =>
				!Editor.isEditor(n) &&
				SlateElement.isElement(n) &&
				Editor.isBlock(editor, n),
		}),
	);

	if (!match) return alignment === "left";

	const [node] = match;
	const element = node as CustomElement;

	// Check if element has align property (for paragraphs and other alignable elements)
	if ("align" in element) {
		return (element.align || "left") === alignment;
	}

	return alignment === "left"; // Default alignment
};

/**
 * Get current alignment from the selected block
 */
export const getCurrentAlignment = (editor: Editor): AlignmentFormat => {
	const { selection } = editor;
	if (!selection) return "left";

	const [match] = Array.from(
		Editor.nodes(editor, {
			at: Editor.unhangRange(editor, selection),
			match: (n) =>
				!Editor.isEditor(n) &&
				SlateElement.isElement(n) &&
				Editor.isBlock(editor, n),
		}),
	);

	if (!match) return "left";

	const [node] = match;
	const element = node as CustomElement;

	// Check if element has align property
	if ("align" in element) {
		return element.align || "left";
	}

	return "left"; // Default alignment
};

/**
 * Set alignment for selected blocks
 */
export const setAlignment = (
	editor: Editor,
	alignment: AlignmentFormat,
): void => {
	const { selection } = editor;
	if (!selection) return;

	// Apply alignment to all selected block elements
	Transforms.setNodes(
		editor,
		{ align: alignment === "left" ? undefined : alignment }, // Don't store "left" as it's the default
		{
			match: (n) =>
				!Editor.isEditor(n) &&
				SlateElement.isElement(n) &&
				Editor.isBlock(editor, n) &&
				// Only apply to elements that support alignment
				(n.type === "paragraph" ||
					n.type === "heading" ||
					n.type === "blockquote"),
		},
	);
};

// Block element types
export type BlockFormat =
	| "paragraph"
	| "heading"
	| "blockquote"
	| "bulleted-list"
	| "numbered-list"
	| "list-item"
	| "code-block";

/**
 * Check if a block format is currently active
 */
export const isBlockActive = (editor: Editor, format: BlockFormat): boolean => {
	const { selection } = editor;
	if (!selection) return false;

	const [match] = Array.from(
		Editor.nodes(editor, {
			at: Editor.unhangRange(editor, selection),
			match: (n) =>
				!Editor.isEditor(n) && SlateElement.isElement(n) && n.type === format,
		}),
	);

	return !!match;
};

/**
 * Check if we're currently in a list (bulleted or numbered)
 */
export const isListActive = (editor: Editor): boolean => {
	return (
		isBlockActive(editor, "bulleted-list") ||
		isBlockActive(editor, "numbered-list")
	);
};

/**
 * Toggle a block format
 */
export const toggleBlock = (editor: Editor, format: BlockFormat): void => {
	const isActive = isBlockActive(editor, format);
	const isList = format === "bulleted-list" || format === "numbered-list";

	// If we're toggling a list and there's already a list active, remove it first
	if (isList && isListActive(editor)) {
		unwrapList(editor);
	}

	// If the format is active and it's not a list, convert to paragraph
	if (isActive && !isList) {
		Transforms.setNodes(
			editor,
			{ type: "paragraph" },
			{
				match: (n) =>
					!Editor.isEditor(n) &&
					SlateElement.isElement(n) &&
					Editor.isBlock(editor, n),
			},
		);
		return;
	}

	// If it's a list format, wrap in list
	if (isList) {
		wrapInList(editor, format as "bulleted-list" | "numbered-list");
	} else {
		// For other block formats, just set the node type
		Transforms.setNodes(
			editor,
			{ type: format },
			{
				match: (n) =>
					!Editor.isEditor(n) &&
					SlateElement.isElement(n) &&
					Editor.isBlock(editor, n),
			},
		);
	}
};

/**
 * Wrap selected blocks in a list
 */
export const wrapInList = (
	editor: Editor,
	listType: "bulleted-list" | "numbered-list",
): void => {
	// First, ensure we're not already in a list
	if (isListActive(editor)) {
		unwrapList(editor);
	}

	// Convert current blocks to list items
	Transforms.setNodes(
		editor,
		{ type: "list-item" },
		{
			match: (n) =>
				!Editor.isEditor(n) &&
				SlateElement.isElement(n) &&
				Editor.isBlock(editor, n),
		},
	);

	// Wrap in the appropriate list type
	const listElement: CustomElement = {
		type: listType,
		children: [],
	};

	Transforms.wrapNodes(editor, listElement, {
		match: (n) => SlateElement.isElement(n) && n.type === "list-item",
	});
};

/**
 * Unwrap list items from their parent list
 */
export const unwrapList = (editor: Editor): void => {
	// Unwrap from list container
	Transforms.unwrapNodes(editor, {
		match: (n) =>
			SlateElement.isElement(n) &&
			(n.type === "bulleted-list" || n.type === "numbered-list"),
		split: true,
	});

	// Convert list items back to paragraphs
	Transforms.setNodes(editor, { type: "paragraph" } as Partial<CustomElement>, {
		match: (n) => SlateElement.isElement(n) && n.type === "list-item",
	});
};

/**
 * Get all active formats for the current selection
 */
export const getActiveFormats = (editor: Editor) => {
	const marks = Editor.marks(editor) || {};

	return {
		bold: marks.bold === true,
		italic: marks.italic === true,
		underline: marks.underline === true,
		strikethrough: marks.strikethrough === true,
		code: marks.code === true,
		fontSize: marks.fontSize,
		fontFamily: marks.fontFamily,
		color: marks.color,
		alignment: getCurrentAlignment(editor),
	};
};

/**
 * Get the current block type
 */
export const getCurrentBlockType = (editor: Editor): string => {
	const { selection } = editor;
	if (!selection) return "paragraph";

	const [match] = Array.from(
		Editor.nodes(editor, {
			at: Editor.unhangRange(editor, selection),
			match: (n) => !Editor.isEditor(n) && SlateElement.isElement(n),
		}),
	);

	if (match) {
		const [node] = match;
		if (SlateElement.isElement(node)) {
			return node.type;
		}
	}

	return "paragraph";
};

/**
 * Check if the current selection has mixed formatting
 */
export const hasMixedFormatting = (
	editor: Editor,
	format: TextFormat,
): boolean => {
	const { selection } = editor;
	if (!selection) return false;

	const texts = Array.from(
		Editor.nodes(editor, {
			at: selection,
			match: (n) => Text.isText(n),
		}),
	);

	if (texts.length <= 1) return false;

	const firstTextFormat = (texts[0][0] as CustomText)[format];
	return texts.some(
		([text]) => (text as CustomText)[format] !== firstTextFormat,
	);
};

/**
 * Check if the current selection is inside a link
 */
export const isLinkActive = (editor: Editor): boolean => {
	const { selection } = editor;
	if (!selection) return false;

	const [match] = Array.from(
		Editor.nodes(editor, {
			at: selection,
			match: (n) =>
				!Editor.isEditor(n) && SlateElement.isElement(n) && n.type === "link",
		}),
	);

	return !!match;
};

/**
 * Get the current link element if selection is inside a link
 */
export const getCurrentLink = (editor: Editor): LinkElement | null => {
	const { selection } = editor;
	if (!selection) return null;

	const [match] = Array.from(
		Editor.nodes(editor, {
			at: selection,
			match: (n) =>
				!Editor.isEditor(n) && SlateElement.isElement(n) && n.type === "link",
		}),
	);

	return match ? (match[0] as LinkElement) : null;
};

/**
 * Insert or update a link
 */
export const insertLink = (
	editor: Editor,
	url: string,
	text?: string,
): void => {
	const { selection } = editor;
	if (!selection) return;

	// If there's a selection and no text provided, use the selected text
	if (Range.isCollapsed(selection) && !text) {
		// No selection and no text provided, insert new link with URL as text
		const linkElement: LinkElement = {
			type: "link",
			url,
			children: [{ text: url }],
		};
		Transforms.insertNodes(editor, linkElement);
	} else if (Range.isCollapsed(selection) && text) {
		// No selection but text provided, insert new link with custom text
		const linkElement: LinkElement = {
			type: "link",
			url,
			children: [{ text }],
		};
		Transforms.insertNodes(editor, linkElement);
	} else {
		// There's a selection, wrap it in a link
		const linkElement: LinkElement = {
			type: "link",
			url,
			children: [],
		};

		if (isLinkActive(editor)) {
			// Update existing link
			Transforms.setNodes(
				editor,
				{ url },
				{
					match: (n) =>
						!Editor.isEditor(n) &&
						SlateElement.isElement(n) &&
						n.type === "link",
				},
			);
		} else {
			// Wrap selection in new link
			Transforms.wrapNodes(editor, linkElement, { split: true });
			Transforms.collapse(editor, { edge: "end" });
		}
	}
};

/**
 * Remove link from current selection
 */
export const removeLink = (editor: Editor): void => {
	Transforms.unwrapNodes(editor, {
		match: (n) =>
			!Editor.isEditor(n) && SlateElement.isElement(n) && n.type === "link",
	});
};

/**
 * Check if the current list item is empty
 */
export const isCurrentListItemEmpty = (editor: Editor): boolean => {
	const { selection } = editor;
	if (!selection) return false;

	const [match] = Array.from(
		Editor.nodes(editor, {
			at: selection,
			match: (n) =>
				!Editor.isEditor(n) &&
				SlateElement.isElement(n) &&
				n.type === "list-item",
		}),
	);

	if (!match) return false;

	const [listItem] = match;
	if (!SlateElement.isElement(listItem)) return false;

	// Check if the list item has only empty text
	const text = Editor.string(editor, Editor.range(editor, match[1]));
	return text.trim() === "";
};

/**
 * Get word count for selected text, or 0 if no selection
 */
export const getSelectedWordCount = (editor: Editor): number => {
	const { selection } = editor;
	if (!selection || Range.isCollapsed(selection)) {
		return 0;
	}

	try {
		const selectedText = Editor.string(editor, selection);
		return selectedText.trim() ? selectedText.trim().split(/\s+/).length : 0;
	} catch (error) {
		console.warn("Error getting selected word count:", error);
		return 0;
	}
};

/**
 * Get cursor position as line and column numbers (1-indexed)
 */
export const getCursorPosition = (
	editor: Editor,
): { line: number; column: number } => {
	const { selection } = editor;
	if (!selection) {
		return { line: 1, column: 1 };
	}

	try {
		// Use the focus point of the selection (where the cursor is)
		const { focus } = selection;

		// For simple documents, the line number is the first element in the path + 1
		// The column is the offset + 1
		const line = (focus.path[0] ?? 0) + 1;
		const column = focus.offset + 1;

		return { line, column };
	} catch (error) {
		console.warn("Error getting cursor position:", error);
		return { line: 1, column: 1 };
	}
};

/**
 * Handle Enter key press in lists
 * Returns true if the event was handled, false otherwise
 */
export const handleListEnterKey = (editor: Editor): boolean => {
	const { selection } = editor;
	if (!selection) return false;

	// Check if we're in a list item
	const [listItemMatch] = Array.from(
		Editor.nodes(editor, {
			at: selection,
			match: (n) =>
				!Editor.isEditor(n) &&
				SlateElement.isElement(n) &&
				n.type === "list-item",
		}),
	);

	if (!listItemMatch) return false;

	// Check if the current list item is empty
	if (isCurrentListItemEmpty(editor)) {
		const [, listItemPath] = listItemMatch;

		// Find the parent list container
		const [listMatch] = Array.from(
			Editor.nodes(editor, {
				at: listItemPath,
				match: (n) =>
					SlateElement.isElement(n) &&
					(n.type === "bulleted-list" || n.type === "numbered-list"),
			}),
		);

		if (!listMatch) return false;

		const [listNode, listPath] = listMatch;

		// Check if this is the only item in the list
		if (SlateElement.isElement(listNode) && listNode.children.length === 1) {
			// If it's the only item, convert the entire list to a paragraph
			Transforms.setNodes(editor, {
				type: "paragraph",
			} as Partial<CustomElement>);

			Transforms.unwrapNodes(editor, {
				match: (n) =>
					SlateElement.isElement(n) &&
					(n.type === "bulleted-list" || n.type === "numbered-list"),
			});
		} else {
			// If there are other items, just convert this list item to a paragraph
			// and move it outside the list
			Transforms.setNodes(editor, {
				type: "paragraph",
			} as Partial<CustomElement>);

			// Move the paragraph outside the list
			Transforms.moveNodes(editor, {
				at: listItemPath,
				to: [...listPath.slice(0, -1), listPath[listPath.length - 1] + 1],
			});
		}

		return true;
	}

	// If the list item has content, let Slate handle the default behavior
	// (which will create a new list item)
	return false;
};
