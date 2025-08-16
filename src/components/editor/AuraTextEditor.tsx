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
import { sanitizeFilename } from "@/shared/filenames";
import type { ExportToPdfOptions, SaveAsResult } from "@/shared/saveAs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useSharedYjsDocument } from "../../hooks/useSharedYjsDocument";
import { isElectron } from "../../utils/environment";
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
	// Guard to avoid concurrent exports (desktop PDF); mirrors Save As pattern.
	const isExportingRef = useRef(false);
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
	// Use latestEditorValueRef inside this callback to avoid recreating it on every keystroke.
	const handleMenuAction = useCallback(
		(action: string, data?: unknown) => {
			switch (action) {
				case "file.save":
					if (onSave) {
						onSave(latestEditorValueRef.current);
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
							const electronApi =
								typeof window !== "undefined" ? window.electronAPI : undefined;
							// Sanitize documentTitle for filesystem use (Windows/macOS forbidden chars).
							// Centralized, cross-platform filename sanitization using 'filenamify'
							const safeTitle = sanitizeFilename(documentTitle || "Untitled");

							// Helper to extract a trimmed filePath string from opaque IPC responses.
							const extractFilePath = (res: unknown): string | undefined => {
								if (res && typeof res === "object") {
									const raw = (res as Record<string, unknown>).filePath;
									if (typeof raw === "string") {
										const trimmed = raw.trim();
										return trimmed.length > 0 ? trimmed : undefined;
									}
								}
								return undefined;
							};

							// Helper to persist per-user local path from a SaveAsResult
							const persistLocalPathFromResult = async (res: SaveAsResult) => {
								try {
									const filePath = extractFilePath(res);
									if (filePath) {
										await setUserDocumentLocalPath({ documentId, filePath });
									} else {
										await clearUserDocumentLocalPath({ documentId });
									}
								} catch (err) {
									console.warn(
										"Failed to persist per-user filePath:",
										err instanceof Error ? err.message : String(err),
									);
									toast.error("Saved locally, but cloud path update failed", {
										description:
											err instanceof Error ? err.message : String(err ?? ""),
									});
								}
							};

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
										// Normalize to an ArrayBuffer for the IPC contract (preload requires ArrayBuffer for yjs-v1)
										// Yjs may return ArrayBuffer, Uint8Array, or other ArrayBufferLike (including SharedArrayBuffer).
										let yjsArrayBuffer: ArrayBuffer;
										if (update instanceof ArrayBuffer) {
											yjsArrayBuffer = update;
										} else {
											// For Uint8Array, SharedArrayBuffer-backed views, or other ArrayBufferLike,
											// create a compact ArrayBuffer copy to guarantee a plain ArrayBuffer instance.
											const u8 =
												update instanceof Uint8Array
													? update
													: new Uint8Array(update as ArrayBufferLike);
											// Copy to ensure we don't carry a SharedArrayBuffer or an oversized buffer with offsets.
											yjsArrayBuffer = u8.slice().buffer;
										}
										const res: SaveAsResult = await electronApi.saveAsNative({
											// Preserve the typed Id<"documents"> rather than coercing to string
											documentId,
											documentTitle,
											defaultPath: `${safeTitle}.awdoc`,
											format: "yjs-v1",
											// Pass an ArrayBuffer per the preload contract
											yjsUpdate: yjsArrayBuffer,
											yjsProtocolVersion: 1,
										});
										// Only mark Yjs as succeeded after a confirmed success response
										if (res && "success" in res && res.success) {
											yjsSucceeded = true;
											setLastSaved(new Date());
											setIsModified(false);
											console.log("Save As (Yjs) succeeded");
											// Persist per-user saved file path in documentLocalPaths (not the global document)
											await persistLocalPathFromResult(res);
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
										await persistLocalPathFromResult(res);
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
									content: latestEditorValueRef.current,
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
				case "file.export": {
					// Prevent concurrent exports (mirror Save As guard)
					if (isExportingRef.current) {
						console.debug(
							"Export already in progress, ignoring duplicate action",
						);
						break;
					}
					isExportingRef.current = true;

					// Desktop-only PDF export via Electron printToPDF
					if (!isElectron()) {
						toast.error("Export is only available in the desktop app.");
						isExportingRef.current = false;
						break;
					}
					const electronApi =
						typeof window !== "undefined" ? window.electronAPI : undefined;
					// If Electron is present but the preload API isn't exposed, surface a clearer message.
					if (!electronApi || typeof electronApi.exportToPdf !== "function") {
						toast.error("Export is currently unavailable.");
						isExportingRef.current = false;
						break;
					}
					(async () => {
						let toastId: string | number | undefined;
						try {
							toastId = toast.loading("Exporting to PDF...");
							// Build printable HTML from latest editor value (Slate nodes)
							const nodes = latestEditorValueRef.current || [];
							// Simple Slate -> HTML serializer (covers common nodes/marks)
							// Small helper to escape text to avoid HTML injection in exported HTML
							// Local serializer types to avoid explicit `any` and improve lints.
							// These are intentionally minimal and mirror the shapes used by the serializer.
							type SlateTextNode = {
								text?: string;
								bold?: boolean;
								italic?: boolean;
								underline?: boolean;
								code?: boolean;
							} & Record<string, unknown>;
							type SlateNodeLike =
								| SlateTextNode
								| {
										type?: string;
										children?: SlateNodeLike[];
										// common optional properties used by serializer
										url?: string;
										src?: string;
										alt?: string;
										caption?: string;
										// allow other props
										[key: string]: unknown;
								  };
							const escapeHtml = (s: string) => {
								return String(s)
									.replace(/&/g, "&amp;")
									.replace(/</g, "&lt;")
									.replace(/>/g, "&gt;")
									.replace(/"/g, "&quot;");
							};

							const serializeMarks = (textNode: SlateTextNode) => {
								let text = escapeHtml(textNode.text ?? "");
								// Apply marks in a consistent order
								if (textNode.code) text = `<code>${text}</code>`;
								if (textNode.bold) text = `<strong>${text}</strong>`;
								if (textNode.italic) text = `<em>${text}</em>`;
								if (textNode.underline) text = `<u>${text}</u>`;
								return text;
							};

							// Serialize inline array (children) preserving marks and nested inline nodes
							const serializeInlineChildren = (
								children: SlateNodeLike[] = [],
							) =>
								children
									.map((child) => {
										if (child == null) return "";
										if ((child as SlateNodeLike).type)
											return serializeNode(child as SlateNodeLike);
										return serializeMarks(child as SlateTextNode);
									})
									.join("");

							const serializeNode = (node: SlateNodeLike): string => {
								if (!node || typeof node !== "object") return "";

								// Headings
								if (node.type === "heading-one") {
									const children = serializeInlineChildren(
										node.children as SlateNodeLike[],
									);
									return `<h1>${children}</h1>`;
								}
								if (node.type === "heading-two") {
									const children = serializeInlineChildren(
										node.children as SlateNodeLike[],
									);
									return `<h2>${children}</h2>`;
								}

								// Lists
								if (node.type === "bulleted-list") {
									const items = (
										Array.isArray(node.children) ? node.children : []
									)
										.map((li: SlateNodeLike) => {
											const liChildren = Array.isArray(
												(li as SlateNodeLike).children,
											)
												? ((li as SlateNodeLike).children as SlateNodeLike[])
												: [];
											return `<li>${serializeInlineChildren(liChildren)}</li>`;
										})
										.join("");
									return `<ul>${items}</ul>`;
								}
								if (node.type === "numbered-list") {
									const items = (
										Array.isArray(node.children) ? node.children : []
									)
										.map((li: SlateNodeLike) => {
											const liChildren = Array.isArray(
												(li as SlateNodeLike).children,
											)
												? ((li as SlateNodeLike).children as SlateNodeLike[])
												: [];
											return `<li>${serializeInlineChildren(liChildren)}</li>`;
										})
										.join("");
									return `<ol>${items}</ol>`;
								}

								// Blockquote
								if (node.type === "block-quote" || node.type === "blockquote") {
									const children = Array.isArray(node.children)
										? serializeInlineChildren(node.children)
										: "";
									return `<blockquote>${children}</blockquote>`;
								}

								// Image node -> render figure/img/figcaption
								if (node.type === "image") {
									// Defensive accessors
									const url =
										node.url && typeof node.url === "string"
											? node.url
											: typeof node.src === "string"
												? node.src
												: "";
									const alt =
										node.alt && typeof node.alt === "string"
											? escapeHtml(node.alt)
											: "";
									// caption may be a property or a child node with type 'caption'
									let captionText = "";
									if (node.caption && typeof node.caption === "string") {
										captionText = escapeHtml(node.caption);
									} else if (Array.isArray(node.children)) {
										// look for a caption child node or caption property in children
										const captionChild = (
											node.children as SlateNodeLike[]
										).find(
											(c: SlateNodeLike | undefined) =>
												c && (c as SlateNodeLike).type === "caption",
										);
										if (
											captionChild &&
											Array.isArray((captionChild as SlateNodeLike).children)
										) {
											captionText = serializeInlineChildren(
												(captionChild as SlateNodeLike)
													.children as SlateNodeLike[],
											);
										} else {
											// fallback: join inline text children
											captionText = serializeInlineChildren(
												node.children as SlateNodeLike[],
											);
										}
									}
									const imgHtml = `<img src="${escapeHtml(url)}" alt="${alt}" />`;
									if (captionText && captionText.trim().length > 0) {
										return `<figure>${imgHtml}<figcaption>${captionText}</figcaption></figure>`;
									}
									return `<figure>${imgHtml}</figure>`;
								}

								// Table node: simple table -> table > tr > td
								if (node.type === "table") {
									if (!Array.isArray(node.children)) return "<table></table>";
									const rows = (node.children as SlateNodeLike[])
										.map((row: SlateNodeLike) => {
											if (
												!row ||
												typeof row !== "object" ||
												!Array.isArray(row.children)
											)
												return "<tr></tr>";
											const cells = (row.children as SlateNodeLike[])
												.map((cell: SlateNodeLike) => {
													// cell.children may be blocks or inlines; preserve inline marks inside
													if (Array.isArray(cell.children)) {
														// Render cell content without wrapping <p> to keep compact
														const cellInner = (cell.children as SlateNodeLike[])
															.map((child: SlateNodeLike) => {
																if ((child as SlateNodeLike).type)
																	return serializeNode(child as SlateNodeLike);
																return serializeMarks(child as SlateTextNode);
															})
															.join("");
														return `<td>${cellInner}</td>`;
													}
													return "<td></td>";
												})
												.join("");
											return `<tr>${cells}</tr>`;
										})
										.join("");
									// Support optional caption property or child node
									let tableCaption = "";
									if (node.caption && typeof node.caption === "string") {
										tableCaption = escapeHtml(node.caption);
									} else if (Array.isArray(node.children)) {
										// sometimes caption is a separate child with type 'caption' not included in rows
										const captionChild = (
											node.children as SlateNodeLike[]
										).find(
											(c: SlateNodeLike | undefined) =>
												c && c.type === "caption",
										);
										if (
											captionChild &&
											Array.isArray((captionChild as SlateNodeLike).children)
										) {
											tableCaption = serializeInlineChildren(
												(captionChild as SlateNodeLike)
													.children as SlateNodeLike[],
											);
										}
									}
									if (tableCaption) {
										return `<figure><table>${rows}</table><figcaption>${tableCaption}</figcaption></figure>`;
									}
									return `<table>${rows}</table>`;
								}

								// Paragraphs and generic blocks
								if (Array.isArray(node.children)) {
									// Some custom node types should be wrapped but annotated for styling
									const childrenHtml = (node.children as SlateNodeLike[])
										.map((child: SlateNodeLike | SlateTextNode | null) => {
											if (child == null) return "";
											if ((child as SlateNodeLike).type)
												return serializeNode(child as SlateNodeLike);
											return serializeMarks(child as SlateTextNode);
										})
										.join("");

									// If node is a known block type like 'paragraph'
									if (!node.type || node.type === "paragraph") {
										return `<p>${childrenHtml}</p>`;
									}

									// Safe fallback for custom block node types: preserve children and add data-node-type
									const safeType =
										typeof node.type === "string"
											? escapeHtml(node.type)
											: "unknown";
									return `<div data-node-type="${safeType}">${childrenHtml}</div>`;
								}

								// Text node fallback
								if ("text" in node) {
									return serializeMarks(node);
								}

								return "";
							};
							const bodyHtml = nodes.map(serializeNode).join("\n");
							const html = `<!doctype html>
	<html>
	<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>${documentTitle ? String(documentTitle) : "Document"}</title>
	<style>
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color: #111827; margin: 40px; line-height: 1.5; }
	h1 { font-size: 28px; margin: 0 0 12px 0; }
	h2 { font-size: 22px; margin: 0 0 10px 0; }
	p { margin: 0 0 10px 0; font-size: 14px; }
	blockquote { margin: 0 0 10px 0; padding-left: 12px; border-left: 4px solid #e5e7eb; color: #374151; }
	ul, ol { margin: 0 0 10px 20px; }
	code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace; }
	figure { margin: 0 0 12px 0; }
	figure img { max-width: 100%; height: auto; }
	figcaption { font-size: 12px; color: #6b7280; margin-top: 6px; }
	table { border-collapse: collapse; margin: 0 0 10px 0; width: auto; }
	td, th { border: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: top; }
	</style>
	</head>
	<body>
	<div class="document-content">
	${bodyHtml}
	</div>
	</body>
	</html>`;
							const safeTitle = sanitizeFilename(documentTitle || "Untitled");
							// Guard the electron API call to avoid calling undefined in browser builds
							const api = electronApi as NonNullable<typeof electronApi>;
							// Narrow the export function to a properly typed alias
							const exportToPdf = api.exportToPdf as (
								opts: ExportToPdfOptions,
							) => Promise<SaveAsResult>;
							const res: SaveAsResult = await exportToPdf({
								html,
								documentTitle,
								defaultPath: `${safeTitle}.pdf`,
							});
							if (res && "success" in res && res.success) {
								// Show toast with optional "Show in folder" action that opens the exported file location
								// Keep a lightweight guard for the preload API being present
								const filePath =
									res.filePath && typeof res.filePath === "string"
										? res.filePath
										: undefined;
								toast.dismiss(toastId);
								toast.success("Exported PDF successfully", {
									action: filePath
										? {
												label: "Show in folder",
												onClick: async () => {
													try {
														// Only call if the preload exposes the API
														if (
															typeof window !== "undefined" &&
															typeof window.electronAPI === "object" &&
															typeof window.electronAPI.showItemInFolder ===
																"function"
														) {
															await window.electronAPI.showItemInFolder(
																filePath,
															);
														}
													} catch (err) {
														console.warn("Failed to show item in folder:", err);
													}
												},
											}
										: undefined,
								});
							} else {
								const maybeError =
									res && typeof res === "object"
										? (res as unknown as Record<string, unknown>).error
										: undefined;
								const errMessage =
									maybeError &&
									typeof maybeError === "object" &&
									"message" in maybeError
										? String((maybeError as Record<string, unknown>).message)
										: "Failed to export PDF";
								toast.dismiss(toastId);
								toast.error("Export failed", { description: errMessage });
							}
						} catch (err) {
							console.error("Export failed:", err);
							toast.dismiss(toastId);
							toast.error("Export failed", {
								description: err instanceof Error ? err.message : String(err),
							});
						} finally {
							// Always clear loading state and allow future exports.
							try {
								if (typeof toastId !== "undefined") {
									toast.dismiss(toastId);
								}
							} catch {
								/* ignore toast dismissal errors */
							}
							isExportingRef.current = false;
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
