import type React from "react";
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type { Descendant, Editor } from "slate";
import { Range } from "slate";
import { HistoryEditor } from "slate-history";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	type getActiveFormats,
	getCurrentLink,
	insertLink,
	setAlignment,
	setFontFamily,
	setFontSize,
	toggleBlock,
	toggleFormat,
} from "../../utils/slateFormatting";
import { ConvexCollaborativeEditor } from "../ConvexCollaborativeEditor";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { EditorLayout } from "./EditorLayout";
import { LinkDialog } from "./LinkDialog";
import type { FontFamilyData, FontSizeData, SelectionStatus } from "./types";

// Type guard functions for better type safety
const isFontSizeData = (data: unknown): data is FontSizeData => {
	return (
		typeof data === "object" &&
		data !== null &&
		"fontSize" in data &&
		typeof (data as FontSizeData).fontSize === "string"
	);
};

const isFontFamilyData = (data: unknown): data is FontFamilyData => {
	return (
		typeof data === "object" &&
		data !== null &&
		"fontFamily" in data &&
		typeof (data as FontFamilyData).fontFamily === "string"
	);
};

// Action types for the formats reducer
type FormatsAction =
	| { type: "SET_ALL"; payload: ReturnType<typeof getActiveFormats> }
	| { type: "RESET" };

// Reducer for managing active formats state
const formatsReducer = (
	state: ReturnType<typeof getActiveFormats>,
	action: FormatsAction,
): ReturnType<typeof getActiveFormats> => {
	switch (action.type) {
		case "SET_ALL":
			return action.payload;
		case "RESET":
			return {
				bold: false,
				italic: false,
				underline: false,
				strikethrough: false,
				code: false,
				fontSize: undefined,
				fontFamily: undefined,
				color: undefined,
				alignment: "left",
			};
		default:
			return state;
	}
};

interface AuraTextEditorProps {
	documentId: Id<"documents">; // Required for collaboration
	initialValue?: Descendant[];
	className?: string;
	showMenuBar?: boolean;
	showToolbar?: boolean;
	showStatusBar?: boolean;
	documentTitle?: string;
	onSave?: (value: Descendant[]) => void;
	onChange?: (value: Descendant[]) => void;
	onSignOut?: () => void;
	onNewDocument?: () => Promise<void>; // Callback to create and navigate to a new document
	onExitToDashboard?: () => void; // Callback to exit to dashboard
	// Status bar configuration
	showCharCount?: boolean; // Default: true
	showReadingTime?: boolean; // Default: true
	readingWPM?: number; // Default: 200
}

export const AuraTextEditor: React.FC<AuraTextEditorProps> = ({
	documentId,
	initialValue,
	className = "",
	showMenuBar = true,
	showToolbar = true,
	showStatusBar = true,
	documentTitle = "Untitled Document",
	onSave,
	onChange,
	onSignOut,
	onNewDocument,
	onExitToDashboard,
	// Status bar configuration
	showCharCount = true,
	showReadingTime = true,
	readingWPM = 200,
}) => {
	// Editor state
	const [editorValue, setEditorValue] = useState<Descendant[]>(
		initialValue || [{ type: "paragraph", children: [{ text: "" }] }],
	);
	const [isModified, setIsModified] = useState(false);
	const [lastSaved, setLastSaved] = useState<Date>(new Date());
	const [syncStatus, setSyncStatus] = useState<
		"synced" | "syncing" | "error" | "offline" | "pending" | "disabled"
	>("synced");

	// Dialog state for unsaved changes confirmation
	const [showNewDocumentDialog, setShowNewDocumentDialog] = useState(false);
	const [showExitDialog, setShowExitDialog] = useState(false);
	const [showLinkDialog, setShowLinkDialog] = useState(false);

	// Editor instance ref for undo/redo operations
	const editorRef = useRef<Editor | null>(null);

	// Track autosave completion to update lastSaved on successful sync
	const pendingAutosaveRef = useRef(false);

	// Selection state for bottom status bar
	const [selectionStatus, setSelectionStatus] = useState<SelectionStatus>({
		line: 1,
		column: 1,
		selectedWordCount: 0,
		hasSelection: false,
	});

	// Active formatting state using reducer for better state management
	const [activeFormats, dispatchFormats] = useReducer(formatsReducer, {
		bold: false,
		italic: false,
		underline: false,
		strikethrough: false,
		code: false,
		fontSize: undefined,
		fontFamily: undefined,
		color: undefined,
		alignment: "left",
	});

	// Calculate document statistics
	const documentStats = useMemo(() => {
		const text = editorValue
			.map((node) => {
				if ("children" in node) {
					return node.children
						.map((child) => ("text" in child ? child.text : ""))
						.join("");
				}
				return "";
			})
			.filter((text) => text.length > 0)
			.join(" ");

		const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
		const characterCount = text.length;
		const charsWithSpaces = text.length;
		const charsWithoutSpaces = text.replace(/\s/g, "").length;

		return {
			wordCount,
			characterCount,
			charsWithSpaces,
			charsWithoutSpaces,
		};
	}, [editorValue]);

	// Handle editor value changes
	const handleEditorChange = useCallback(
		(value: Descendant[]) => {
			setEditorValue(value);
			setIsModified(true);
			onChange?.(value);
		},
		[onChange],
	);

	// Handle editor ready callback
	const handleEditorReady = useCallback((editor: Editor) => {
		editorRef.current = editor;
	}, []);

	// Handle new document creation
	const handleNewDocument = useCallback(async () => {
		if (!onNewDocument) {
			// Fallback: just clear the editor if no callback is provided
			setEditorValue([{ type: "paragraph", children: [{ text: "" }] }]);
			setIsModified(false);
			return;
		}

		try {
			await onNewDocument();
			// The parent component will handle navigation to the new document
			// which will cause this component to re-render with the new document
		} catch (error) {
			console.error("Failed to create new document:", error);
			// Fallback to clearing the editor on error
			setEditorValue([{ type: "paragraph", children: [{ text: "" }] }]);
			setIsModified(false);
		}
	}, [onNewDocument]);

	// Handle new document with unsaved changes check
	const handleNewDocumentWithConfirmation = useCallback(() => {
		if (isModified) {
			// Show confirmation dialog if there are unsaved changes
			setShowNewDocumentDialog(true);
		} else {
			// No unsaved changes, proceed directly
			handleNewDocument();
		}
	}, [isModified, handleNewDocument]);

	// Handle exit to dashboard
	const handleExitToDashboard = useCallback(() => {
		if (!onExitToDashboard) return;

		onExitToDashboard();
	}, [onExitToDashboard]);

	// Handle exit to dashboard with unsaved changes check
	const handleExitToDashboardWithConfirmation = useCallback(() => {
		if (isModified) {
			// Show confirmation dialog if there are unsaved changes
			setShowExitDialog(true);
		} else {
			// No unsaved changes, proceed directly
			handleExitToDashboard();
		}
	}, [isModified, handleExitToDashboard]);

	// Handle menu actions
	const handleMenuAction = useCallback(
		(action: string, data?: unknown) => {
			switch (action) {
				case "file.save":
					if (onSave) {
						onSave(editorValue);
						setIsModified(false);
						setLastSaved(new Date());
					}
					break;
				case "file.new":
					handleNewDocumentWithConfirmation();
					break;
				case "edit.undo":
					if (
						editorRef.current &&
						HistoryEditor.isHistoryEditor(editorRef.current)
					) {
						HistoryEditor.undo(editorRef.current);
					}
					break;
				case "edit.redo":
					if (
						editorRef.current &&
						HistoryEditor.isHistoryEditor(editorRef.current)
					) {
						HistoryEditor.redo(editorRef.current);
					}
					break;
				default:
					console.log("Menu action:", action, data);
			}
		},
		[editorValue, onSave, handleNewDocumentWithConfirmation],
	);

	// Handle formatting changes from the editor
	const handleFormattingChange = useCallback(
		(formats: ReturnType<typeof getActiveFormats>, _blockType: string) => {
			dispatchFormats({ type: "SET_ALL", payload: formats });
			// Note: blockType tracking removed for now, can be re-added when needed
		},
		[],
	);

	// Handle selection changes from the editor
	const handleSelectionChange = useCallback((selection: SelectionStatus) => {
		setSelectionStatus(selection);
	}, []);

	// Handle toolbar actions
	const handleToolbarAction = useCallback((action: string, data?: unknown) => {
		if (!editorRef.current) return;

		const editor = editorRef.current;

		switch (action) {
			// Inline formatting
			case "format.bold":
			case "format.italic":
			case "format.underline":
			case "format.strikethrough":
			case "format.code": {
				const formatType = action.replace("format.", "") as
					| "bold"
					| "italic"
					| "underline"
					| "strikethrough"
					| "code";
				toggleFormat(editor, formatType);
				break;
			}

			// Font styling
			case "format.fontSize":
				if (isFontSizeData(data)) {
					setFontSize(editor, data.fontSize);
				}
				break;
			case "format.fontFamily":
				if (isFontFamilyData(data)) {
					setFontFamily(editor, data.fontFamily);
				}
				break;

			// Block formatting
			case "format.bulletList":
				toggleBlock(editor, "bulleted-list");
				break;
			case "format.numberedList":
				toggleBlock(editor, "numbered-list");
				break;
			case "format.blockquote":
				toggleBlock(editor, "blockquote");
				break;

			// Text alignment
			case "format.alignLeft":
			case "format.alignCenter":
			case "format.alignRight":
			case "format.alignJustify": {
				const alignment = action.replace("format.align", "").toLowerCase() as
					| "left"
					| "center"
					| "right"
					| "justify";
				setAlignment(editor, alignment);
				break;
			}

			// Insert actions
			case "insert.link":
				setShowLinkDialog(true);
				break;

			default:
				console.log("Toolbar action:", action, data);
		}
	}, []);

	// Handle link dialog
	const handleLinkInsert = useCallback((url: string, text?: string) => {
		if (!editorRef.current) return;
		insertLink(editorRef.current, url, text);
	}, []);

	const handleLinkDialogClose = useCallback(() => {
		setShowLinkDialog(false);
	}, []);

	// Get link dialog initial values
	const getLinkDialogValues = useCallback(() => {
		if (!editorRef.current) return { url: "", text: "", hasSelection: false };

		const editor = editorRef.current;
		const { selection } = editor;

		if (!selection) return { url: "", text: "", hasSelection: false };

		const currentLink = getCurrentLink(editor);
		const hasSelection = !Range.isCollapsed(selection);

		return {
			url: currentLink?.url || "",
			text: "",
			hasSelection,
		};
	}, []);

	// Handle sync status changes from the collaboration system
	const handleSyncStatusChange = useCallback(
		(
			status:
				| "synced"
				| "syncing"
				| "error"
				| "offline"
				| "pending"
				| "disabled",
		) => {
			setSyncStatus(status);

			// Detect autosave completion: when we move from syncing -> synced,
			// update the lastSaved timestamp and clear the modified flag.
			if (status === "syncing") {
				pendingAutosaveRef.current = true;
			} else if (status === "synced") {
				if (pendingAutosaveRef.current) {
					setLastSaved(new Date());
					setIsModified(false);
				}
				pendingAutosaveRef.current = false;
			} else if (
				status === "error" ||
				status === "offline" ||
				status === "disabled"
			) {
				// Do not mark as saved in these states; clear any pending autosave flag
				pendingAutosaveRef.current = false;
			}
		},
		[],
	);

	// Dialog handlers
	const handleConfirmNewDocument = useCallback(() => {
		setShowNewDocumentDialog(false);
		handleNewDocument();
	}, [handleNewDocument]);

	const handleCancelNewDocument = useCallback(() => {
		setShowNewDocumentDialog(false);
	}, []);

	const handleConfirmExit = useCallback(() => {
		setShowExitDialog(false);
		handleExitToDashboard();
	}, [handleExitToDashboard]);

	const handleCancelExit = useCallback(() => {
		setShowExitDialog(false);
	}, []);

	return (
		<div className={`aura-text-editor h-full ${className}`}>
			<EditorLayout
				showMenuBar={showMenuBar}
				showToolbar={showToolbar}
				showStatusBar={showStatusBar}
				showBottomStatusBar={true}
				onMenuAction={handleMenuAction}
				onToolbarAction={handleToolbarAction}
				onSignOut={onSignOut}
				documentTitle={documentTitle}
				activeFormats={activeFormats}
				documentStatus={{
					wordCount: documentStats.wordCount,
					characterCount: documentStats.characterCount,
					charsWithSpaces: documentStats.charsWithSpaces,
					charsWithoutSpaces: documentStats.charsWithoutSpaces,
					isModified,
					lastSaved,
					syncStatus,
				}}
				selectionStatus={selectionStatus}
				showCharCount={showCharCount}
				showReadingTime={showReadingTime}
				readingWPM={readingWPM}
				onExitToDashboard={handleExitToDashboardWithConfirmation}
			>
				<div className="h-full overflow-auto">
					<div className="mx-auto max-w-[80ch] px-4 sm:px-6 md:px-8 py-6">
						<ConvexCollaborativeEditor
							documentId={documentId}
							placeholder="Start writing your document..."
							onChange={handleEditorChange}
							onEditorReady={handleEditorReady}
							enableSync={true}
							showHeader={false}
							className="min-h-[calc(100vh-12rem)]"
							onSyncStatusChange={handleSyncStatusChange}
							onFormattingChange={handleFormattingChange}
							onLinkShortcut={() => setShowLinkDialog(true)}
							onSelectionChange={handleSelectionChange}
						/>
					</div>
				</div>
			</EditorLayout>

			{/* New Document Confirmation Dialog */}
			<Dialog
				open={showNewDocumentDialog}
				onOpenChange={setShowNewDocumentDialog}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create New Document</DialogTitle>
						<DialogDescription>
							You have unsaved changes in the current document. Creating a new
							document will discard these changes. Are you sure you want to
							continue?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={handleCancelNewDocument}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleConfirmNewDocument}>
							Create New Document
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Exit to Dashboard Confirmation Dialog */}
			<Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Exit to Dashboard</DialogTitle>
						<DialogDescription>
							You have unsaved changes in the current document. Exiting to the
							dashboard will discard these changes. Are you sure you want to
							continue?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={handleCancelExit}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleConfirmExit}>
							Exit to Dashboard
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Link Dialog */}
			<LinkDialog
				isOpen={showLinkDialog}
				onClose={handleLinkDialogClose}
				onInsert={handleLinkInsert}
				{...getLinkDialogValues()}
			/>
		</div>
	);
};

export default AuraTextEditor;
