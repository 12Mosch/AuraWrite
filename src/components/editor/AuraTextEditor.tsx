import { useMutation } from "convex/react";
import type React from "react";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import type { Descendant, Editor } from "slate";
import { Range } from "slate";
import { HistoryEditor } from "slate-history";
import { toast } from "sonner";
import * as Y from "yjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useSharedYjsDocument } from "../../hooks/useSharedYjsDocument";
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
	// Keep a ref to the latest editor value to avoid stale closures during async save-as fallbacks
	const latestEditorValueRef = useRef<Descendant[]>(
		initialValue || [{ type: "paragraph", children: [{ text: "" }] }],
	);
	// Keep it in sync with editorValue
	useEffect(() => {
		latestEditorValueRef.current = editorValue;
	}, [editorValue]);
	const [isModified, setIsModified] = useState(false);
	const [lastSaved, setLastSaved] = useState<Date>(new Date());
	const [syncStatus, setSyncStatus] = useState<
		"synced" | "syncing" | "error" | "offline" | "pending" | "disabled"
	>("synced");

	// Dialog state for unsaved changes confirmation
	const [showNewDocumentDialog, setShowNewDocumentDialog] = useState(false);
	const [showExitDialog, setShowExitDialog] = useState(false);
	const [showLinkDialog, setShowLinkDialog] = useState(false);
	// Guard to avoid re-entrant Save As dialogs (menu action might fire twice)
	const isSavingRef = useRef(false);

	// Access shared Y.Doc for Yjs-native save support
	// useSharedYjsDocument returns a stable yDoc instance shared across components.
	const { yDoc } = useSharedYjsDocument({ documentId });

	// Convex mutations to update/clear per-user local file paths
	// - setUserDocumentLocalPath stores a validated, non-empty path per-user
	// - clearUserDocumentLocalPath removes the per-user mapping (used for deletions)
	const setUserDocumentLocalPath = useMutation(
		api.documents.setUserDocumentLocalPath,
	);
	const clearUserDocumentLocalPath = useMutation(
		api.documents.clearUserDocumentLocalPath,
	);

	// Editor instance ref for undo/redo operations
	const editorRef = useRef<Editor | null>(null);

	// Track autosave completion to update lastSaved on successful sync
	const pendingAutosaveRef = useRef(false);
	// Track whether local edits have occurred (used to distinguish remote/initial syncs)
	const hasLocalEditsRef = useRef(false);

	// Reset autosave / local-edit markers when the active document changes to avoid
	// leaking state between documents if the component remains mounted.
	useEffect(() => {
		// Reference documentId to make the dependency explicit for biome's
		// exhaustive-deps check. This is a deliberate no-op use.
		void documentId;
		pendingAutosaveRef.current = false;
		hasLocalEditsRef.current = false;
	}, [documentId]);

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
			// Mark that the user has performed a local edit. This helps us avoid
			// treating remote/initial syncs as confirmations of a local save.
			hasLocalEditsRef.current = true;
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
						// If there’s nothing to sync, finalize immediately; otherwise wait for 'synced'.
						if (syncStatus === "synced") {
							setLastSaved(new Date());
							setIsModified(false);
							// Clear local edits marker as we've persisted them
							hasLocalEditsRef.current = false;
							pendingAutosaveRef.current = false;
						} else {
							// Wait for the collaboration layer to report 'synced' before
							// clearing modified state and updating lastSaved to avoid
							// showing "Saved" when the backing sync ultimately fails.
							pendingAutosaveRef.current = true;
						}
					}
					break;

				case "file.saveAs": {
					// Prevent multiple dialogs if the action fires repeatedly in quick succession.
					if (isSavingRef.current) {
						console.debug(
							"Save As already in progress, ignoring duplicate action",
						);
						break;
					}
					isSavingRef.current = true;
					// Asynchronous save-as flow to avoid blocking the menu handler.
					(async () => {
						try {
							// Prefer the global ambient type from src/ui/types.d.ts
							const electronApi = window.electronAPI;
							// Sanitize documentTitle for filesystem use (Windows/macOS forbidden chars).
							// Also avoid Windows reserved device names and trim trailing dots/spaces.
							const sanitizeFileName = (name: string) => {
								const reserved = [
									"CON",
									"PRN",
									"AUX",
									"NUL",
									...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
									...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
								];
								let s = name.replace(/[\\/:"*?<>|]+/g, "_").slice(0, 128);
								// Trim trailing dots/spaces (Windows doesn't allow them)
								s = s.replace(/[.\s]+$/g, "");
								// If the basename (case-insensitive) matches a reserved name, prefix with '_'
								const base = s.split(".")[0];
								if (reserved.includes(base.toUpperCase())) {
									s = `_${s}`;
								}
								return s || "Untitled";
							};
							const safeTitle = sanitizeFileName(documentTitle || "Untitled");

							if (
								electronApi &&
								typeof electronApi.saveAsNative === "function"
							) {
								// Prefer Yjs-native snapshot when available.
								let yjsSucceeded = false;
								let yjsCancelled = false;
								try {
									if (typeof yDoc !== "undefined" && yDoc) {
										// Encode current Y.Doc state as a binary update
										const update = Y.encodeStateAsUpdate(yDoc);
										// Normalize to a Uint8Array (YjsBinary) for IPC; handle ArrayBuffer or Uint8Array inputs.
										let yjsUpdate: Uint8Array;
										if (update instanceof ArrayBuffer) {
											yjsUpdate = new Uint8Array(update);
										} else {
											// update is a Uint8Array-like view; create a typed view referencing the same buffer
											yjsUpdate = new Uint8Array(
												update.buffer,
												update.byteOffset,
												update.byteLength,
											);
										}
										const res = await electronApi.saveAsNative({
											// Preserve the typed Id<"documents"> rather than coercing to string
											documentId,
											documentTitle,
											defaultPath: `${safeTitle}.awdoc`,
											format: "yjs-v1",
											// Pass a Uint8Array (YjsBinary) for Yjs updates
											yjsUpdate,
											yjsProtocolVersion: 1,
										});
										// Only mark Yjs as succeeded after a confirmed success response
										if (res && "success" in res && res.success) {
											yjsSucceeded = true;
											setLastSaved(new Date());
											setIsModified(false);
											console.log("Save As (Yjs) succeeded");
											// Persist per-user saved file path in documentLocalPaths (not the global document)
											try {
												// Normalize result shape without using `any`
												let filePath: string | undefined;
												if (res && typeof res === "object") {
													// Convert to unknown first to avoid unsafe structural cast errors
													const r = res as unknown as Record<string, unknown>;
													const raw = r.filePath;
													if (typeof raw === "string") {
														filePath = raw.trim();
													}
												}
												if (filePath) {
													await setUserDocumentLocalPath({
														documentId,
														filePath,
													});
												} else {
													// If the native save didn't return a path, ensure any previous mapping is cleared.
													await clearUserDocumentLocalPath({ documentId });
												}
											} catch (err) {
												console.warn(
													"Failed to persist per-user filePath:",
													err instanceof Error ? err.message : String(err),
												);
												toast.error(
													"Saved locally, but cloud path update failed",
													{
														description:
															err instanceof Error
																? err.message
																: String(
																		err ??
																			"Could not store your local file path for this document.",
																	),
													},
												);
											}
											// Successful Yjs save; skip slate fallback.
										} else {
											// Do not log potentially sensitive paths; extract safe error info.
											const maybeError =
												(res as unknown) && typeof res === "object"
													? (res as unknown as Record<string, unknown>).error
													: undefined;
											const errCode =
												maybeError &&
												typeof maybeError === "object" &&
												"code" in (maybeError as Record<string, unknown>)
													? String((maybeError as Record<string, unknown>).code)
													: undefined;
											const errMessage =
												maybeError &&
												typeof maybeError === "object" &&
												"message" in (maybeError as Record<string, unknown>)
													? String(
															(maybeError as Record<string, unknown>).message,
														)
													: "An error occurred while saving to your filesystem.";
											yjsCancelled = errCode === "CANCELLED";
											if (!yjsCancelled) {
												console.warn(
													"Save As (Yjs) failed:",
													errCode ?? "UNKNOWN",
												);
												toast.error("Save As failed", {
													description: errMessage,
												});
											}
										}
									}
								} catch (err) {
									// Ensure yjsSucceeded remains false on exception so the slate fallback runs.
									console.error(
										"Yjs Save As failed:",
										err instanceof Error ? err.message : String(err),
									);
									toast.error("Save As failed", {
										description:
											err instanceof Error
												? err.message
												: String(
														err ??
															"An unexpected error occurred while saving to your filesystem.",
													),
									});
								}
								// If Yjs path wasn’t used/succeeded and wasn’t cancelled, fall back to Slate JSON.
								if (!yjsSucceeded && !yjsCancelled) {
									const res = await electronApi.saveAsNative({
										documentId,
										documentTitle,
										defaultPath: `${safeTitle}.json`,
										format: "slate-v1",
										slateContent: latestEditorValueRef.current,
									});
									if (res && "success" in res && res.success) {
										setLastSaved(new Date());
										setIsModified(false);
										// Persist saved file path into document metadata (slate fallback)
										try {
											const filePathFromRes =
												(res as unknown) && typeof res === "object"
													? (res as unknown as Record<string, unknown>).filePath
													: undefined;
											if (
												typeof filePathFromRes === "string" &&
												filePathFromRes.trim().length > 0
											) {
												await setUserDocumentLocalPath({
													documentId,
													filePath: filePathFromRes.trim(),
												});
											} else {
												// No valid path returned from the fallback save; ensure any previous mapping is cleared.
												await clearUserDocumentLocalPath({ documentId });
											}
										} catch (err) {
											// Avoid logging full local paths; log only error messages.
											console.warn(
												"Failed to persist per-user filePath (slate fallback):",
												err instanceof Error ? err.message : String(err),
											);
											toast.error(
												"Saved locally, but cloud path update failed",
												{
													description:
														err instanceof Error
															? err.message
															: String(
																	err ??
																		"Could not store your local file path for this document.",
																),
												},
											);
										}
										console.log("Save As succeeded (slate fallback)");
									} else {
										const maybeRes = res as unknown;
										const maybeError =
											maybeRes && typeof maybeRes === "object"
												? (maybeRes as Record<string, unknown>).error
												: undefined;
										const errCode =
											maybeError &&
											typeof maybeError === "object" &&
											"code" in (maybeError as Record<string, unknown>)
												? String((maybeError as Record<string, unknown>).code)
												: undefined;
										const errMessage =
											maybeError &&
											typeof maybeError === "object" &&
											"message" in (maybeError as Record<string, unknown>)
												? String(
														(maybeError as Record<string, unknown>).message,
													)
												: "An error occurred while saving to your filesystem.";
										if (errCode !== "CANCELLED") {
											console.warn(
												"Save As (slate) failed:",
												errCode ?? "UNKNOWN",
											);
											toast.error("Save As failed", {
												description: errMessage,
											});
										}
									}
								}
							} else {
								// Browser fallback: download JSON
								const envelope = {
									format: "slate-v1",
									title: documentTitle || null,
									updatedAt: Date.now(),
									content: editorValue,
								};
								const blob = new Blob([JSON.stringify(envelope, null, 2)], {
									type: "application/json",
								});
								const url = URL.createObjectURL(blob);
								const a = document.createElement("a");
								a.href = url;
								a.download = `${safeTitle}.json`;
								document.body.appendChild(a);
								a.click();
								a.remove();
								URL.revokeObjectURL(url);
								setLastSaved(new Date());
								setIsModified(false);
								// Ensure any previously stored native path is cleared in the cloud
								try {
									await clearUserDocumentLocalPath({ documentId });
								} catch (err) {
									console.warn(
										"Failed to clear per-user filePath after browser Save As:",
										err instanceof Error ? err.message : String(err),
									);
								}
							}
						} catch (err) {
							console.error(
								"Save As failed:",
								err instanceof Error ? err.message : String(err),
							);
						} finally {
							isSavingRef.current = false;
						}
					})();
					break;
				}
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
		[
			editorValue,
			onSave,
			handleNewDocumentWithConfirmation,
			syncStatus,
			documentId,
			documentTitle,
			// include yDoc because Save As now uses the shared Y.Doc snapshot
			yDoc,
			// include setUserDocumentLocalPath and clearUserDocumentLocalPath mutations so linter knows they're used inside the callback
			setUserDocumentLocalPath,
			clearUserDocumentLocalPath,
		],
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

			// Only finalize an autosave when we see a 'synced' state that corresponds
			// to an explicit local save/edit. We use two refs:
			// - pendingAutosaveRef is set by an explicit save action (file.save) or
			//   when we intentionally wait for sync finalization.
			// - hasLocalEditsRef is set when the user performs local edits.
			//
			// This avoids treating remote/initial sync completions as confirmations
			// of a local save.
			if (status === "syncing") {
				// Do not assume syncing implies a local autosave; only keep the pending
				// autosave flag if it was already set by an explicit save action.
				// (No-op here.)
			} else if (status === "synced") {
				if (pendingAutosaveRef.current || hasLocalEditsRef.current) {
					setLastSaved(new Date());
					setIsModified(false);
					// Clear local edits marker as we've persisted them
					hasLocalEditsRef.current = false;
				}
				// Clear pending autosave regardless so we don't hold the flag forever.
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
