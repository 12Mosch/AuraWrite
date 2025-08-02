import type React from "react";
import { useCallback, useState } from "react";
import { createEditor, type Descendant, Editor } from "slate";
import {
	Editable,
	type RenderElementProps,
	type RenderLeafProps,
	Slate,
	withReact,
} from "slate-react";
import "../types/slate"; // Import shared Slate types

// Initial value for the editor
const initialValue: Descendant[] = [
	{
		type: "paragraph",
		children: [{ text: "Start typing your document here..." }],
	},
];

// Component to render paragraph elements
const Element = ({ attributes, children, element }: RenderElementProps) => {
	switch (element.type) {
		case "paragraph":
			return <p {...attributes}>{children}</p>;
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

	// Handle key down events for basic formatting
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (!event.ctrlKey) {
			return;
		}

		switch (event.key) {
			case "b": {
				event.preventDefault();
				// Toggle bold formatting
				const marks = Editor.marks(editor);
				const isActive = marks ? marks.bold === true : false;
				if (isActive) {
					editor.removeMark("bold");
				} else {
					editor.addMark("bold", true);
				}
				break;
			}
			case "i": {
				event.preventDefault();
				// Toggle italic formatting
				const marks = Editor.marks(editor);
				const isActive = marks ? marks.italic === true : false;
				if (isActive) {
					editor.removeMark("italic");
				} else {
					editor.addMark("italic", true);
				}
				break;
			}
		}
	};

	return (
		<div className={`slate-editor ${className}`}>
			<Slate editor={editor} value={value} onChange={handleChange}>
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
