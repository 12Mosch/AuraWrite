import { withYjs, YjsEditor } from "@slate-yjs/core";
import React, { useCallback, useEffect, useMemo } from "react";
import { createEditor, type Descendant, Editor } from "slate";
import { withHistory } from "slate-history";
import {
	Editable,
	type RenderElementProps,
	type RenderLeafProps,
	Slate,
	withReact,
} from "slate-react";
import type { Id } from "../../convex/_generated/dataModel";
import { useError } from "../contexts/ErrorContext";

import {
	type SyncHookReturn,
	useConvexYjsSync,
} from "../hooks/useConvexYjsSync";
import { useOfflineMode } from "../hooks/useOfflineMode";
import { useOptimizedSync as useOptimizedSyncHook } from "../hooks/useOptimizedSync";
import { usePresence } from "../hooks/usePresence";
import { useSharedYjsDocument } from "../hooks/useSharedYjsDocument";
import type { CustomElement, CustomText } from "../types/slate";
import {
	environmentConfig,
	getEnvironment,
	openUrl,
} from "../utils/environment";
import { handleKeyboardShortcuts } from "../utils/keyboardShortcuts";
import {
	getActiveFormats,
	getCurrentBlockType,
	getCursorPosition,
	getSelectedWordCount,
} from "../utils/slateFormatting";
import { DocumentHeader } from "./DocumentHeader";
import { EnhancedErrorDisplay } from "./EnhancedErrorDisplay";

/**
 * Get CSS alignment class based on alignment value
 */
const getAlignmentClass = (
	align?: "left" | "center" | "right" | "justify",
): string => {
	switch (align) {
		case "center":
			return "text-center";
		case "right":
			return "text-right";
		case "justify":
			return "text-justify";
		default:
			return "text-left";
	}
};

/**
 * Mapping of heading levels to their corresponding React components
 */
const headingComponents = {
	1: "h1",
	2: "h2",
	3: "h3",
	4: "h4",
	5: "h5",
	6: "h6",
} as const;

/**
 * Props for the ConvexCollaborativeEditor component
 */
interface ConvexCollaborativeEditorProps {
	/** Document ID to edit */
	documentId: Id<"documents">;
	/** CSS class name for styling */
	className?: string;
	/** Placeholder text */
	placeholder?: string;
	/** Callback when editor content changes */
	onChange?: (value: Descendant[]) => void;
	/** Callback when editor instance is ready */
	onEditorReady?: (editor: Editor) => void;
	/** Whether to enable real-time synchronization */
	enableSync?: boolean;
	/** Whether to show the document header with real-time metadata */
	showHeader?: boolean;
	/** CSS class name for the header */
	headerClassName?: string;
	/** Whether to use optimized sync (default: true) */
	useOptimizedSync?: boolean;

	/** Callback when sync status changes */
	onSyncStatusChange?: (
		status: "synced" | "syncing" | "error" | "offline" | "pending" | "disabled",
	) => void;
	/** Callback when formatting state changes */
	onFormattingChange?: (
		activeFormats: ReturnType<typeof getActiveFormats>,
		currentBlockType: string,
	) => void;
	/** Callback when link shortcut is triggered */
	onLinkShortcut?: () => void;
	/** Callback when selection/cursor position changes */
	onSelectionChange?: (selection: {
		line: number;
		column: number;
		selectedWordCount: number;
		hasSelection: boolean;
	}) => void;
}

/**
 * Collaborative editor component with Convex-Yjs synchronization
 *
 * This component combines:
 * - Slate.js for rich text editing
 * - Y.js for CRDT-based collaboration
 * - Convex for real-time backend synchronization
 * - IndexedDB for offline persistence
 */
export const ConvexCollaborativeEditor: React.FC<
	ConvexCollaborativeEditorProps
> = ({
	documentId,
	className = "",
	placeholder = "Start typing...",
	onChange,
	onEditorReady,
	enableSync = true,
	showHeader = true,
	headerClassName = "",
	useOptimizedSync = true,

	onSyncStatusChange,
	onFormattingChange,
	onLinkShortcut,
	onSelectionChange,
}) => {
	// Initial editor value
	const initialValue: Descendant[] = [
		{ type: "paragraph", children: [{ text: "" }] },
	];

	// Error handling
	const { error: globalError } = useError();

	// Initialize Y.Doc and shared types using the shared document hook
	const {
		yDoc,
		sharedType,
		indexeddbProvider,
		isSynced: isLocalSynced,
		persistenceError,
	} = useSharedYjsDocument({
		documentId,
		initialValue,
		enablePersistence: true,
		enableGarbageCollection: true,
	});

	// Offline mode support
	const offlineMode = useOfflineMode({
		documentId,
		yDoc,
		enabled: true,
		autoResolveConflicts: true,
	});

	// Initialize synchronization (optimized or regular)
	const regularSync = useConvexYjsSync({
		documentId,
		yDoc,
		sharedType,
		enabled: enableSync && !useOptimizedSync,
		debounceMs: 500,
		maxRetries: 3,
	});

	const optimizedSyncHook = useOptimizedSyncHook({
		documentId,
		yDoc,
		sharedType,
		enabled: enableSync && useOptimizedSync,
		debounceMs: 300,
		maxBatchSize: 10,
		maxWaitTime: 2000,
		maxRetries: 3,
		useCompression: true,
	});

	// Use the appropriate sync based on configuration with proper typing
	const syncHook: SyncHookReturn = useOptimizedSync
		? optimizedSyncHook
		: regularSync;

	const {
		isSyncing,
		isSynced: isServerSynced,
		syncError,
		isConnected,
		resync,
	} = syncHook;

	// Initialize real-time presence tracking
	const { updatePresence } = usePresence(documentId, {
		enabled: enableSync,
		updateInterval: 5000,
		trackCursor: true,
		trackSelection: true,
	});

	// Create Slate editor with Yjs integration and history
	const editor = useMemo(() => {
		// Don't create editor until sharedType is available
		if (!sharedType) {
			return null;
		}

		const e = withReact(withYjs(withHistory(createEditor()), sharedType));

		// Configure inline elements
		const { isInline } = e;
		e.isInline = (element) => {
			return element.type === "link" ? true : isInline(element);
		};

		// Ensure editor has a consistent structure
		const { normalizeNode } = e;
		e.normalizeNode = (entry) => {
			// Ensure the editor always has at least one paragraph
			if (e.children.length === 0) {
				e.insertNode({ type: "paragraph", children: [{ text: "" }] });
				return;
			}

			normalizeNode(entry);
		};

		return e;
	}, [sharedType]);

	// Notify parent when editor is ready
	useEffect(() => {
		if (editor && onEditorReady) {
			onEditorReady(editor);
		}
	}, [editor, onEditorReady]);

	// Get editor value from Y.js shared type instead of maintaining separate state
	const value = useMemo(() => {
		// Return initial value if editor is not ready or not synced
		if (!editor || !isLocalSynced) {
			return initialValue;
		}

		// Get the current value from the Y.js shared type
		try {
			// Ensure editor has children before accessing
			if (editor.children?.length > 0) {
				return editor.children;
			}
			return initialValue;
		} catch (error) {
			console.warn("Error getting editor value from Y.js:", error);
			return initialValue;
		}
	}, [editor, isLocalSynced]);

	// Connect/disconnect the Yjs editor
	useEffect(() => {
		// Only connect after the shared document is synced and editor is ready
		if (!isLocalSynced || !editor) {
			console.log(
				"Waiting for Y.Doc to sync and editor to be ready before connecting...",
			);
			return;
		}

		console.log("Connecting Y.js editor to shared document:", documentId, {
			sharedTypeLength: sharedType.length,
			yDocClientId: yDoc.clientID,
		});
		// Connect the editor to start synchronizing with the shared type
		YjsEditor.connect(editor);

		// Wait for IndexedDB to sync if persistence is enabled
		if (indexeddbProvider) {
			indexeddbProvider.whenSynced.then(() => {
				console.log("Y.Doc synced with IndexedDB for document:", documentId);
			});
		}

		// Cleanup function to disconnect the editor
		return () => {
			if (editor) {
				try {
					console.log(
						"Disconnecting Y.js editor from shared document:",
						documentId,
					);
					YjsEditor.disconnect(editor);
				} catch (error) {
					console.warn("Error disconnecting Y.js editor:", error);
				}
			}
		};
	}, [
		editor,
		indexeddbProvider,
		isLocalSynced,
		documentId,
		sharedType.length,
		yDoc.clientID,
	]);

	// Handle Y.js updates to prevent DOM sync issues
	useEffect(() => {
		if (!sharedType || !isLocalSynced || !editor) return;

		const handleYjsUpdate = () => {
			// Force editor to re-normalize after Y.js updates
			try {
				Editor.normalize(editor, { force: true });
			} catch (error) {
				console.warn("Error normalizing editor after Y.js update:", error);
			}
		};

		sharedType.observeDeep(handleYjsUpdate);

		return () => {
			sharedType.unobserveDeep(handleYjsUpdate);
		};
	}, [editor, sharedType, isLocalSynced]);

	// Handle editor value changes
	const handleChange = (newValue: Descendant[]) => {
		// With Y.js integration, the value is managed by the shared type
		// We only need to call the onChange callback and update presence
		onChange?.(newValue);

		// Update presence with current selection (safely)
		if (enableSync && editor) {
			try {
				if (editor.selection) {
					updatePresence(undefined, editor.selection);
				}
			} catch (error) {
				console.warn("Error updating presence:", error);
			}
		}

		// Notify about formatting changes
		if (editor && onFormattingChange) {
			try {
				const activeFormats = getActiveFormats(editor);
				const currentBlockType = getCurrentBlockType(editor);
				onFormattingChange(activeFormats, currentBlockType);
			} catch (error) {
				console.warn("Error getting formatting state:", error);
			}
		}

		// Notify about selection changes
		if (editor && onSelectionChange) {
			try {
				const cursorPosition = getCursorPosition(editor);
				const selectedWordCount = getSelectedWordCount(editor);
				const hasSelection = selectedWordCount > 0;

				onSelectionChange({
					line: cursorPosition.line,
					column: cursorPosition.column,
					selectedWordCount,
					hasSelection,
				});
			} catch (error) {
				console.warn("Error getting selection state:", error);
			}
		}
	};

	// Render element function for different block types
	const renderElement = (props: RenderElementProps) => {
		const { attributes, children, element } = props;

		switch (element.type) {
			case "heading": {
				const level =
					(element as CustomElement & { level?: number }).level || 1;
				const align = (
					element as CustomElement & {
						align?: "left" | "center" | "right" | "justify";
					}
				).align;
				const alignmentClass = getAlignmentClass(align);

				// Use mapping approach to reduce repetition
				const HeadingComponent =
					headingComponents[level as keyof typeof headingComponents] || "h1";

				return React.createElement(
					HeadingComponent,
					{ ...attributes, className: alignmentClass },
					children,
				);
			}

			case "blockquote": {
				const align = (
					element as CustomElement & {
						align?: "left" | "center" | "right" | "justify";
					}
				).align;
				const alignmentClass = getAlignmentClass(align);
				return (
					<blockquote
						{...attributes}
						className={`border-l-4 border-gray-300 pl-4 italic text-gray-700 ${alignmentClass}`}
					>
						{children}
					</blockquote>
				);
			}

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

			case "code-block":
				return (
					<pre
						{...attributes}
						className="bg-gray-100 p-2 rounded font-mono text-sm"
					>
						<code>{children}</code>
					</pre>
				);

			case "link": {
				const linkElement = element as CustomElement & { url: string };
				const linkAttrs = environmentConfig.getLinkAttributes();
				const shouldHandleManually =
					environmentConfig.shouldHandleLinksManually();

				const handleLinkClick = shouldHandleManually
					? (e: React.MouseEvent) => {
							console.log("Link clicked (Electron):", {
								url: linkElement.url,
								environment: getEnvironment(),
							});
							e.preventDefault();
							openUrl(linkElement.url).catch((error) => {
								console.error("Failed to open link:", error);
							});
						}
					: undefined;

				// Ensure URL has protocol for href attribute
				let hrefUrl = linkElement.url;
				if (
					hrefUrl &&
					!hrefUrl.startsWith("http://") &&
					!hrefUrl.startsWith("https://")
				) {
					hrefUrl = `https://${hrefUrl}`;
				}

				return (
					<a
						{...attributes}
						href={hrefUrl}
						{...linkAttrs}
						{...(handleLinkClick && { onClick: handleLinkClick })}
						className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
					>
						{children}
					</a>
				);
			}

			default: {
				// Default case handles paragraphs and other block elements
				const align = (
					element as CustomElement & {
						align?: "left" | "center" | "right" | "justify";
					}
				).align;
				const alignmentClass = getAlignmentClass(align);
				return (
					<p {...attributes} className={alignmentClass}>
						{children}
					</p>
				);
			}
		}
	};

	// Render leaf function for text formatting
	const renderLeaf = useCallback((props: RenderLeafProps) => {
		const { attributes, children, leaf } = props;
		let element = <span {...attributes}>{children}</span>;

		const customLeaf = leaf as CustomText;

		if (customLeaf.bold) {
			element = <strong>{element}</strong>;
		}

		if (customLeaf.italic) {
			element = <em>{element}</em>;
		}

		if (customLeaf.underline) {
			element = <u>{element}</u>;
		}

		if (customLeaf.strikethrough) {
			element = <s>{element}</s>;
		}

		if (customLeaf.code) {
			element = (
				<code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">
					{element}
				</code>
			);
		}

		// Apply font styling
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

		if (Object.keys(style).length > 0) {
			element = <span style={style}>{element}</span>;
		}

		return element;
	}, []);

	// Handle keyboard shortcuts
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (editor) {
				handleKeyboardShortcuts(event, editor, onLinkShortcut);
			}
		},
		[editor, onLinkShortcut],
	);

	// Calculate overall sync status
	const overallSyncStatus = useMemo(() => {
		if (!enableSync) return "disabled";
		if (isSyncing) return "syncing";
		if (syncError) return "error";
		if (!isConnected) return "offline";
		if (isLocalSynced && isServerSynced) return "synced";
		return "pending";
	}, [
		enableSync,
		isSyncing,
		syncError,
		isConnected,
		isLocalSynced,
		isServerSynced,
	]);

	// Notify parent component of sync status changes
	useEffect(() => {
		if (onSyncStatusChange) {
			onSyncStatusChange(
				overallSyncStatus as
					| "synced"
					| "syncing"
					| "error"
					| "offline"
					| "pending"
					| "disabled",
			);
		}
	}, [overallSyncStatus, onSyncStatusChange]);

	return (
		<div className={`convex-collaborative-editor ${className}`}>
			{/* Document Header with Real-time Metadata */}
			{showHeader && (
				<div className="border-b bg-white">
					<DocumentHeader
						documentId={documentId}
						className={`p-4 ${headerClassName}`}
						showCollaborators={true}
						showLastUpdated={true}
						editable={true}
					/>
				</div>
			)}

			{/* Error display */}
			<EnhancedErrorDisplay
				syncError={syncError}
				persistenceError={persistenceError}
				hasGlobalError={!!globalError}
				resync={resync}
				isConnected={isConnected}
				isSyncing={isSyncing}
				offlineMode={offlineMode}
			/>

			{/* Editor */}
			<div className="relative">
				{editor ? (
					<Slate
						key={documentId} // Force re-render when document changes
						editor={editor}
						initialValue={value}
						onChange={handleChange}
					>
						<Editable
							placeholder={placeholder}
							className="min-h-[200px] p-4 focus:outline-none"
							spellCheck
							autoFocus
							renderElement={renderElement}
							renderLeaf={renderLeaf}
							onKeyDown={handleKeyDown}
						/>
					</Slate>
				) : (
					<div className="min-h-[200px] p-4 flex items-center justify-center text-gray-500">
						Initializing editor...
					</div>
				)}

				{/* Loading overlay */}
				{!isLocalSynced && (
					<div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
						<div className="text-gray-600">Loading document...</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default ConvexCollaborativeEditor;
