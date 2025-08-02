import type React from "react";
import { useCallback, useState } from "react";
import { createEditor, type Descendant } from "slate";
import {
	Editable,
	type RenderElementProps,
	type RenderLeafProps,
	Slate,
	withReact,
} from "slate-react";
import "../types/slate"; // Import shared Slate types
import { handleKeyboardShortcuts } from "../utils/keyboardShortcuts";

// Initial value for the editor
const initialValue: Descendant[] = [
	{
		type: "paragraph",
		children: [{ text: "Start typing your document here..." }],
	},
];

// Component to render elements
const Element = ({ attributes, children, element }: RenderElementProps) => {
	switch (element.type) {
		case "paragraph":
			return <p {...attributes}>{children}</p>;
		case "bulleted-list":
			return (
				<ul {...attributes} className="list-disc list-inside">
					{children}
				</ul>
			);
		case "numbered-list":
			return (
				<ol {...attributes} className="list-decimal list-inside">
					{children}
				</ol>
			);
		case "list-item":
			return <li {...attributes}>{children}</li>;
		default:
			return <div {...attributes}>{children}</div>;
	}
};

// Component to render text with formatting
const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
	if (leaf.bold) {
		children = <strong>{children}</strong>;
	}

	if (leaf.italic) {
		children = <em>{children}</em>;
	}

	return <span {...attributes}>{children}</span>;
};

interface SlateEditorProps {
	className?: string;
	placeholder?: string;
	onChange?: (value: Descendant[]) => void;
}

export const SlateEditor: React.FC<SlateEditorProps> = ({
	className = "",
	placeholder = "Start typing...",
	onChange,
}) => {
	// Create a Slate editor object that won't change across renders
	const [editor] = useState(() => withReact(createEditor()));

	// Manage editor value state
	const [value, setValue] = useState<Descendant[]>(initialValue);

	// Render element callback
	const renderElement = useCallback(
		(props: RenderElementProps) => <Element {...props} />,
		[],
	);

	// Render leaf callback
	const renderLeaf = useCallback(
		(props: RenderLeafProps) => <Leaf {...props} />,
		[],
	);

	// Handle editor value changes
	const handleChange = (newValue: Descendant[]) => {
		setValue(newValue);
		onChange?.(newValue);
	};

	// Handle key down events using centralized keyboard shortcuts
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			handleKeyboardShortcuts(event, editor);
		},
		[editor],
	);

	return (
		<div className={`slate-editor ${className}`}>
			<Slate editor={editor} initialValue={value} onChange={handleChange}>
				<Editable
					renderElement={renderElement}
					renderLeaf={renderLeaf}
					placeholder={placeholder}
					onKeyDown={handleKeyDown}
					className="min-h-[200px] p-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					spellCheck
					autoFocus
				/>
			</Slate>
		</div>
	);
};

export default SlateEditor;
