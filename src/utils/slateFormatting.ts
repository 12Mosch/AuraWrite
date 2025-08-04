import {
	Editor,
	Path,
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
	try {
		const marks = Editor.marks(editor);
		return marks ? (marks as CustomText)[format] === true : false;
	} catch (error) {
		console.warn(`Error checking if format '${format}' is active:`, error);
		return false;
	}
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
	try {
		const marks = Editor.marks(editor);
		return marks?.fontSize;
	} catch (error) {
		console.warn("Error getting current font size:", error);
		return undefined;
	}
};

/**
 * Get current font family from editor marks
 */
export const getCurrentFontFamily = (editor: Editor): string | undefined => {
	try {
		const marks = Editor.marks(editor);
		return marks?.fontFamily;
	} catch (error) {
		console.warn("Error getting current font family:", error);
		return undefined;
	}
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
	try {
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
	} catch (error) {
		console.warn("Error getting current alignment:", error);
		return "left";
	}
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
	try {
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
	} catch (error) {
		console.warn("Error getting active formats, returning defaults:", error);

		// Return default values when marks cannot be retrieved
		// This prevents crashes when the document structure is invalid
		return {
			bold: false,
			italic: false,
			underline: false,
			strikethrough: false,
			code: false,
			fontSize: undefined,
			fontFamily: undefined,
			color: undefined,
			alignment: getCurrentAlignment(editor),
		};
	}
};

/**
 * Get the current block type
 */
export const getCurrentBlockType = (editor: Editor): string => {
	try {
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
				return (node as CustomElement).type;
			}
		}

		return "paragraph";
	} catch (error) {
		console.warn("Error getting current block type:", error);
		return "paragraph";
	}
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
 * Get character count (including spaces) for selected text, or 0 if no selection
 */
export const getSelectedCharCountWithSpaces = (editor: Editor): number => {
	const { selection } = editor;
	if (!selection || Range.isCollapsed(selection)) {
		return 0;
	}

	try {
		const selectedText = Editor.string(editor, selection);
		return selectedText.length;
	} catch (error) {
		console.warn("Error getting selected character count with spaces:", error);
		return 0;
	}
};

/**
 * Get character count (excluding spaces) for selected text, or 0 if no selection
 */
export const getSelectedCharCountWithoutSpaces = (editor: Editor): number => {
	const { selection } = editor;
	if (!selection || Range.isCollapsed(selection)) {
		return 0;
	}

	try {
		const selectedText = Editor.string(editor, selection);
		return selectedText.replace(/\s/g, "").length;
	} catch (error) {
		console.warn(
			"Error getting selected character count without spaces:",
			error,
		);
		return 0;
	}
};

/**
 * Check if an element creates a visual line in the editor
 */
const isLineCreatingElement = (element: CustomElement): boolean => {
	return [
		"paragraph",
		"heading",
		"blockquote",
		"code-block",
		"list-item",
	].includes(element.type);
};

/**
 * Check if the document has nested structures that require traversal-based line counting
 */
const hasNestedStructures = (editor: Editor): boolean => {
	try {
		const nodeEntries = Array.from(
			Editor.nodes(editor, {
				match: (n) =>
					!Editor.isEditor(n) &&
					SlateElement.isElement(n) &&
					(n.type === "bulleted-list" || n.type === "numbered-list"),
			}),
		);
		return nodeEntries.length > 0;
	} catch (error) {
		console.warn("Error checking for nested structures:", error);
		return false;
	}
};

/**
 * Get visual line number using document traversal for nested structures
 */
const getVisualLineNumber = (editor: Editor, targetPath: Path): number => {
	try {
		let lineCount = 0;

		// Get all block-level elements in document order
		const nodeEntries = Array.from(
			Editor.nodes(editor, {
				match: (n) =>
					!Editor.isEditor(n) &&
					SlateElement.isElement(n) &&
					Editor.isBlock(editor, n),
			}),
		);

		// Count visual lines up to the target path
		for (const [node, path] of nodeEntries) {
			// Stop if we've passed the target path
			if (Path.compare(path, targetPath) > 0) {
				break;
			}

			// Count this element if it creates a visual line
			if (SlateElement.isElement(node) && isLineCreatingElement(node)) {
				lineCount++;

				// If this is exactly our target path, we're done
				if (Path.equals(path, targetPath)) {
					break;
				}
			}
		}

		return Math.max(1, lineCount);
	} catch (error) {
		console.warn("Error calculating visual line number:", error);
		return 1;
	}
};

/**
 * Get cursor position as line and column numbers (1-indexed)
 * Handles nested Slate document structures like lists and blockquotes
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

		// Validate that the path exists and has at least one element
		if (!focus.path || focus.path.length === 0) {
			console.warn("Invalid focus path:", focus.path);
			return { line: 1, column: 1 };
		}

		// The column is always the offset + 1
		const column = focus.offset + 1;

		// Check if document has nested structures
		if (hasNestedStructures(editor)) {
			// Use traversal-based line counting for complex documents
			const line = getVisualLineNumber(editor, focus.path);
			return { line, column };
		} else {
			// Use simple path-based counting for flat documents
			const line = focus.path[0] + 1;
			return { line, column };
		}
	} catch (error) {
		console.warn("Error getting cursor position:", error);
		return { line: 1, column: 1 };
	}
};

/**
 * Validate and fix document structure to prevent crashes
 * This function can be called to ensure the document follows Slate.js schema
 */
export const validateAndFixDocumentStructure = (editor: Editor): boolean => {
	try {
		let hasChanges = false;

		// Check for orphaned list-items at root level
		for (let i = 0; i < editor.children.length; i++) {
			const child = editor.children[i];
			if (
				SlateElement.isElement(child) &&
				(child as CustomElement).type === "list-item"
			) {
				console.warn(
					`Found orphaned list-item at root level (index ${i}), wrapping in bulleted-list`,
				);

				// Wrap the list-item in a bulleted-list
				const listWrapper: CustomElement = {
					type: "bulleted-list",
					children: [],
				};

				Transforms.wrapNodes(editor, listWrapper, { at: [i] });
				hasChanges = true;
				break; // Process one at a time to avoid path conflicts
			}
		}

		return hasChanges;
	} catch (error) {
		console.warn("Error validating document structure:", error);
		return false;
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

		// Use Editor.withoutNormalizing to prevent intermediate normalization
		Editor.withoutNormalizing(editor, () => {
			// Check if this is the only item in the list
			if (SlateElement.isElement(listNode) && listNode.children.length === 1) {
				// If it's the only item, replace the entire list with a paragraph
				// First, unwrap the list to get the list-item at the list's position
				Transforms.unwrapNodes(editor, {
					at: listPath,
					match: (n) =>
						SlateElement.isElement(n) &&
						(n.type === "bulleted-list" || n.type === "numbered-list"),
				});

				// Now convert the list-item (which is now at listPath) to a paragraph
				Transforms.setNodes(
					editor,
					{
						type: "paragraph",
					} as Partial<CustomElement>,
					{
						at: listPath,
					},
				);
			} else {
				// If there are other items, convert this list item to a paragraph
				// and move it outside the list

				// First convert the list-item to a paragraph
				Transforms.setNodes(
					editor,
					{
						type: "paragraph",
					} as Partial<CustomElement>,
					{
						at: listItemPath,
					},
				);

				// Then move the paragraph outside the list
				const targetPath = [
					...listPath.slice(0, -1),
					listPath[listPath.length - 1] + 1,
				];
				Transforms.moveNodes(editor, {
					at: listItemPath,
					to: targetPath,
				});
			}
		});

		return true;
	}

	// If the list item has content, let Slate handle the default behavior
	// (which will create a new list item)
	return false;
};
