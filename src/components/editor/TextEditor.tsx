import type React from "react";
import {useCallback, useEffect, useMemo, useState} from "react";
import {type BaseSelection, createEditor, type Descendant, Editor,} from "slate";
import {withHistory} from "slate-history";
import {Editable, type RenderElementProps, type RenderLeafProps, Slate, withReact,} from "slate-react";
import {cn} from "@/lib/utils";
import type {CustomElement, CustomText, EditorFormats, HeadingElement, ParagraphElement,} from "@/types/slate.ts";

interface TextEditorProps {
	value?: Descendant[];
	onChange?: (value: Descendant[]) => void;
	placeholder?: string;
	className?: string;
	readOnly?: boolean;
	autoFocus?: boolean;
	onSelectionChange?: (selection: BaseSelection) => void;
	onFormatChange?: (formats: EditorFormats) => void;
}

// Initial value for the editor
const initialValue: Descendant[] = [
	{
		type: "paragraph",
		children: [{ text: "" }],
	},
];

// Element renderer
const Element = ({ attributes, children, element }: RenderElementProps) => {
	const customElement = element as CustomElement;
	const style: React.CSSProperties = {};

	// Type narrowing for paragraph elements
	if (customElement.type === "paragraph") {
		const paragraphElement = customElement as ParagraphElement;
		if (paragraphElement.align) {
			style.textAlign = paragraphElement.align;
		}
	}

	switch (customElement.type) {
		case "blockquote":
			return (
				<blockquote
					{...attributes}
					className="border-l-4 border-gray-300 pl-4 italic text-gray-700 my-4"
				>
					{children}
				</blockquote>
			);
		case "bulleted-list":
			return (
				<ul {...attributes} className="list-disc list-inside my-4 space-y-1">
					{children}
				</ul>
			);
		case "numbered-list":
			return (
				<ol {...attributes} className="list-decimal list-inside my-4 space-y-1">
					{children}
				</ol>
			);
		case "list-item":
			return (
				<li {...attributes} className="ml-4">
					{children}
				</li>
			);
		case "heading": {
			const headingElement = customElement as HeadingElement;
			const HeadingTag =
				`h${headingElement.level}` as keyof React.JSX.IntrinsicElements;
			const headingClasses: Record<number, string> = {
				1: "text-3xl font-bold my-4",
				2: "text-2xl font-bold my-3",
				3: "text-xl font-bold my-3",
				4: "text-lg font-bold my-2",
				5: "text-base font-bold my-2",
				6: "text-sm font-bold my-2",
			};
			const Component = HeadingTag as React.ElementType;
			return (
				<Component
					{...attributes}
					className={headingClasses[headingElement.level]}
				>
					{children}
				</Component>
			);
		}
		case "code-block":
			return (
				<pre
					{...attributes}
					className="bg-gray-100 p-4 rounded-md font-mono text-sm overflow-x-auto my-4"
				>
					<code>{children}</code>
				</pre>
			);
		default:
			return (
				<p {...attributes} style={style} className="my-2 leading-relaxed">
					{children}
				</p>
			);
	}
};

// Leaf renderer
const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
	const customLeaf = leaf as CustomText;
	const style: React.CSSProperties = {};

	if (customLeaf.fontSize) {
		style.fontSize = `${customLeaf.fontSize}px`;
	}

	if (customLeaf.fontFamily) {
		style.fontFamily = customLeaf.fontFamily;
	}

	if (customLeaf.color) {
		style.color = customLeaf.color;
	}

	if (customLeaf.bold) {
		children = <strong>{children}</strong>;
	}

	if (customLeaf.italic) {
		children = <em>{children}</em>;
	}

	if (customLeaf.underline) {
		children = <u>{children}</u>;
	}

	if (customLeaf.strikethrough) {
		children = <s>{children}</s>;
	}

	if (customLeaf.code) {
		children = (
			<code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">
				{children}
			</code>
		);
	}

	return (
		<span {...attributes} style={style}>
			{children}
		</span>
	);
};

export const TextEditor: React.FC<TextEditorProps> = ({
	value = initialValue,
	onChange,
	placeholder = "Start writing...",
	className = "",
	readOnly = false,
	autoFocus = false,
	onSelectionChange,
	onFormatChange,
}) => {
	const [editorValue, setEditorValue] = useState<Descendant[]>(value);

	// Create editor with plugins
	const editor = useMemo(() => withHistory(withReact(createEditor())), []);

	// Update internal value when prop changes
	useEffect(() => {
		setEditorValue(value);
	}, [value]);

	// Handle value changes
	const handleChange = useCallback(
		(newValue: Descendant[]) => {
			setEditorValue(newValue);
			onChange?.(newValue);

			// Notify about selection changes
			if (onSelectionChange) {
				onSelectionChange(editor.selection);
			}

			// Notify about format changes
			if (onFormatChange) {
				const marks = Editor.marks(editor);
				onFormatChange(marks || {});
			}
		},
		[onChange, onSelectionChange, onFormatChange, editor],
	);

	// Handle keyboard shortcuts
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (!event.ctrlKey && !event.metaKey) {
				return;
			}

			switch (event.key) {
				case "b": {
					event.preventDefault();
					const marks = Editor.marks(editor) as CustomText | null;
					const isActive = marks ? marks.bold === true : false;
					if (isActive) {
						Editor.removeMark(editor, "bold");
					} else {
						Editor.addMark(editor, "bold", true);
					}
					break;
				}
				case "i": {
					event.preventDefault();
					const marks = Editor.marks(editor) as CustomText | null;
					const isActive = marks ? marks.italic === true : false;
					if (isActive) {
						Editor.removeMark(editor, "italic");
					} else {
						Editor.addMark(editor, "italic", true);
					}
					break;
				}
				case "u": {
					event.preventDefault();
					const marks = Editor.marks(editor) as CustomText | null;
					const isActive = marks ? marks.underline === true : false;
					if (isActive) {
						Editor.removeMark(editor, "underline");
					} else {
						Editor.addMark(editor, "underline", true);
					}
					break;
				}
				case "`": {
					event.preventDefault();
					const marks = Editor.marks(editor) as CustomText | null;
					const isActive = marks ? marks.code === true : false;
					if (isActive) {
						Editor.removeMark(editor, "code");
					} else {
						Editor.addMark(editor, "code", true);
					}
					break;
				}
			}
		},
		[editor],
	);

	return (
		<div className={cn("text-editor h-full", className)}>
			<Slate editor={editor} value={editorValue} onChange={handleChange}>
				<Editable
					renderElement={Element}
					renderLeaf={Leaf}
					placeholder={placeholder}
					onKeyDown={handleKeyDown}
					readOnly={readOnly}
					autoFocus={autoFocus}
					className={cn(
						"h-full w-full p-6 focus:outline-none",
						"prose prose-slate max-w-none",
						"text-gray-900 leading-relaxed",
						readOnly && "cursor-default",
					)}
					style={{
						minHeight: "calc(100vh - 200px)",
						fontSize: "16px",
						lineHeight: "1.6",
					}}
				/>
			</Slate>
		</div>
	);
};

export default TextEditor;
