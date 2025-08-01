import { withYjs, YjsEditor } from "@slate-yjs/core";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import {
	type BaseEditor,
	createEditor,
	type Descendant,
	Editor,
	Transforms,
} from "slate";
import {
	Editable,
	type ReactEditor,
	type RenderElementProps,
	type RenderLeafProps,
	Slate,
	withReact,
} from "slate-react";
import {
	useNetworkStatus,
	useNetworkStatusMessage,
} from "../hooks/useNetworkStatus";
import { useYjsDocument } from "../hooks/useYjsDocument";

// TypeScript type definitions for Slate
type CustomElement = { type: "paragraph"; children: CustomText[] };
type CustomText = { text: string; bold?: boolean; italic?: boolean };

declare module "slate" {
	interface CustomTypes {
		Editor: BaseEditor & ReactEditor;
		Element: CustomElement;
		Text: CustomText;
	}
}

// Initial value for the editor
const initialValue: Descendant[] = [
	{
		type: "paragraph",
		children: [{ text: "Start typing your collaborative document here..." }],
	},
];

// Element component for rendering different node types
const Element = ({ attributes, children, element }: RenderElementProps) => {
	switch (element.type) {
		case "paragraph":
			return <p {...attributes}>{children}</p>;
		default:
			return <div {...attributes}>{children}</div>;
	}
};

// Leaf component for rendering text with formatting
const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
	if (leaf.bold) {
		children = <strong>{children}</strong>;
	}

	if (leaf.italic) {
		children = <em>{children}</em>;
	}

	return <span {...attributes}>{children}</span>;
};

// Props interface for the CollaborativeEditor component
interface CollaborativeEditorProps {
	className?: string;
	placeholder?: string;
	documentId?: string;
	onChange?: (value: Descendant[]) => void;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
	className = "",
	placeholder = "Start typing...",
	documentId = "default-document",
	onChange,
}) => {
	// Initialize Y.Doc and shared types using the custom hook
	const {
		yDoc,
		sharedType,
		indexeddbProvider,
		isSynced,
		persistenceError,
		persistenceAvailable,
	} = useYjsDocument({
		documentId,
		initialValue,
		enablePersistence: true,
		enableGarbageCollection: true,
	});

	// Monitor network status for offline editing capabilities
	const networkStatus = useNetworkStatus();
	const networkMessage = useNetworkStatusMessage(networkStatus);

	// Create Slate editor with Yjs integration
	const editor = useMemo(() => {
		// Create the base editor with React integration and Yjs binding
		const e = withYjs(withReact(createEditor()), sharedType);

		// Add normalization to ensure editor always has at least 1 valid child
		// This prevents crashes when collaborative changes result in an empty editor
		const { normalizeNode } = e;
		e.normalizeNode = (entry) => {
			const [node] = entry;

			// If this is the editor node and it has no children, add a default paragraph
			if (Editor.isEditor(node) && node.children.length === 0) {
				Transforms.insertNodes(
					e,
					{
						type: "paragraph",
						children: [{ text: "" }],
					},
					{ at: [0] },
				);
				return;
			}

			// Otherwise, use the default normalization
			return normalizeNode(entry);
		};

		return e;
	}, [sharedType]);

	// Get editor value from Y.js shared type instead of maintaining separate state
	const value = useMemo(() => {
		if (!isSynced) {
			return initialValue;
		}

		// Get the current value from the Y.js shared type
		try {
			return editor.children.length > 0 ? editor.children : initialValue;
		} catch (error) {
			console.warn("Error getting editor value from Y.js:", error);
			return initialValue;
		}
	}, [editor.children, isSynced]);

	// Connect/disconnect the Yjs editor
	useEffect(() => {
		// Connect the editor to start synchronizing with the shared type
		YjsEditor.connect(editor);

		// Wait for IndexedDB to sync if persistence is enabled
		if (indexeddbProvider) {
			indexeddbProvider.whenSynced
				.then(() => {
					console.log("Y.Doc synced with IndexedDB");
				})
				.catch((error) => {
					console.error("Failed to sync Y.Doc with IndexedDB:", error);
					// Continue operation even if IndexedDB sync fails
					// The editor will still work with in-memory collaboration
				});
		}

		// Cleanup function to disconnect the editor
		return () => {
			try {
				YjsEditor.disconnect(editor);
			} catch (error) {
				console.warn("Error disconnecting Y.js editor:", error);
			}
			// Note: Y.Doc cleanup is handled by the useYjsDocument hook
		};
	}, [editor, indexeddbProvider]);

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
		// With Y.js integration, the value is managed by the shared type
		// We only need to call the onChange callback
		onChange?.(newValue);
	};

	// Handle keyboard shortcuts
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (!event.ctrlKey && !event.metaKey) {
			return;
		}

		switch (event.key) {
			case "b": {
				event.preventDefault();
				const marks = Editor.marks(editor);
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
				const marks = Editor.marks(editor);
				const isActive = marks ? marks.italic === true : false;
				if (isActive) {
					Editor.removeMark(editor, "italic");
				} else {
					Editor.addMark(editor, "italic", true);
				}
				break;
			}
		}
	};

	return (
		<div className={`collaborative-editor ${className}`}>
			{/* Persistence Status Indicator */}
			{persistenceError && (
				<div className="mb-2 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-md text-sm">
					<strong>⚠️ Local Storage Warning:</strong> {persistenceError}
				</div>
			)}

			{!persistenceAvailable && !persistenceError && (
				<div className="mb-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm">
					<strong>❌ Local Storage Unavailable:</strong> Your changes will not
					be saved locally.
				</div>
			)}

			{/* Network Status Indicator */}
			{!networkStatus.isOnline && (
				<div className="mb-2 p-2 bg-blue-100 border border-blue-400 text-blue-700 rounded-md text-sm">
					<strong>🌐 Offline Mode:</strong> You're working offline. Changes are
					saved locally and will sync when you're back online.
				</div>
			)}

			<Slate
				key={documentId} // Force re-render when document changes
				editor={editor}
				value={value}
				onChange={handleChange}
			>
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

			{/* Enhanced Status Information */}
			<div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-1">
						<span
							className={`inline-block w-2 h-2 rounded-full ${
								isSynced && persistenceAvailable && networkStatus.isOnline
									? "bg-green-500"
									: isSynced && persistenceAvailable && !networkStatus.isOnline
										? "bg-blue-500"
										: isSynced && !persistenceAvailable
											? "bg-yellow-500"
											: "bg-gray-400"
							}`}
						></span>
						{isSynced && persistenceAvailable && networkStatus.isOnline
							? "Online & Synced"
							: isSynced && persistenceAvailable && !networkStatus.isOnline
								? "Offline - Saved locally"
								: isSynced && !persistenceAvailable
									? "Editing without local storage"
									: "Syncing..."}
					</div>
					<span>Document: {documentId}</span>
					<span className="text-xs">({networkMessage})</span>
				</div>
				<div className="flex items-center gap-2">
					<span>Client: {yDoc.clientID}</span>
					<span>Length: {sharedType.length}</span>
				</div>
			</div>
		</div>
	);
};

export default CollaborativeEditor;
