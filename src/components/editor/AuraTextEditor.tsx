import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Descendant, Editor } from "slate";
import { HistoryEditor } from "slate-history";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	type getActiveFormats,
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
import type { FontFamilyData, FontSizeData } from "./types";

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
}) => {
	// Editor state
	const [editorValue, setEditorValue] = useState<Descendant[]>(
		initialValue || [{ type: "paragraph", children: [{ text: "" }] }],
	);
	const [isModified, setIsModified] = useState(false);
	const [lastSaved, setLastSaved] = useState<Date>(new Date());
	const [syncStatus, setSyncStatus] = useState<
		"synced" | "syncing" | "error" | "offline"
	>("synced");

	// Dialog state for unsaved changes confirmation
	const [showNewDocumentDialog, setShowNewDocumentDialog] = useState(false);

	// Editor instance ref for undo/redo operations
	const editorRef = useRef<Editor | null>(null);

	// Active formatting state
	const [activeFormats, setActiveFormats] = useState<
		ReturnType<typeof getActiveFormats>
	>({
		bold: false,
		italic: false,
		underline: false,
		strikethrough: false,
		code: false,
		fontSize: undefined,
		fontFamily: undefined,
		color: undefined,
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

		return { wordCount, characterCount };
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
			setActiveFormats(formats);
			// Note: blockType tracking removed for now, can be re-added when needed
		},
		[],
	);

	// Handle toolbar actions
	const handleToolbarAction = useCallback((action: string, data?: unknown) => {
		if (!editorRef.current) return;

		const editor = editorRef.current;

		switch (action) {
			case "format.bold":
				toggleFormat(editor, "bold");
				break;
			case "format.italic":
				toggleFormat(editor, "italic");
				break;
			case "format.underline":
				toggleFormat(editor, "underline");
				break;
			case "format.strikethrough":
				toggleFormat(editor, "strikethrough");
				break;
			case "format.code":
				toggleFormat(editor, "code");
				break;
			case "format.fontSize":
				if (data && typeof data === "object" && "fontSize" in data) {
					setFontSize(editor, (data as FontSizeData).fontSize);
				}
				break;
			case "format.fontFamily":
				if (data && typeof data === "object" && "fontFamily" in data) {
					setFontFamily(editor, (data as FontFamilyData).fontFamily);
				}
				break;
			case "format.bulletList":
				toggleBlock(editor, "bulleted-list");
				break;
			case "format.numberedList":
				toggleBlock(editor, "numbered-list");
				break;
			case "format.alignLeft":
			case "format.alignCenter":
			case "format.alignRight":
			case "format.alignJustify":
				// TODO: Implement text alignment
				console.log("Alignment not yet implemented:", action);
				break;
			default:
				console.log("Toolbar action:", action, data);
		}
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
			// Map the extended status types to the ones expected by DocumentStatus
			const mappedStatus: "synced" | "syncing" | "error" | "offline" =
				status === "pending" || status === "disabled" ? "offline" : status;
			setSyncStatus(mappedStatus);
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

	return (
		<div className={`aura-text-editor h-full ${className}`}>
			<EditorLayout
				showMenuBar={showMenuBar}
				showToolbar={showToolbar}
				showStatusBar={showStatusBar}
				onMenuAction={handleMenuAction}
				onToolbarAction={handleToolbarAction}
				onSignOut={onSignOut}
				documentTitle={documentTitle}
				activeFormats={activeFormats}
				documentStatus={{
					wordCount: documentStats.wordCount,
					characterCount: documentStats.characterCount,
					isModified,
					lastSaved,
					syncStatus,
				}}
			>
				<ConvexCollaborativeEditor
					documentId={documentId}
					placeholder="Start writing your document..."
					onChange={handleEditorChange}
					onEditorReady={handleEditorReady}
					enableSync={true}
					showHeader={false}
					className="h-full"
					onSyncStatusChange={handleSyncStatusChange}
					onFormattingChange={handleFormattingChange}
				/>
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
						<Button onClick={handleConfirmNewDocument}>
							Create New Document
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default AuraTextEditor;
