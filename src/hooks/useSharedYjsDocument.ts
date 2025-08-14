import { slateNodesToInsertDelta } from "@slate-yjs/core";
import { useEffect, useRef, useState } from "react";
import type { Descendant } from "slate";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { Id } from "../../convex/_generated/dataModel";
import { useCloudRecovery } from "../utils/cloudRecovery";

/** Lightweight dev-only logger to avoid noisy production logs */
const debugLog = (...args: unknown[]) => {
	if (process.env.NODE_ENV === "development") {
		// eslint-disable-next-line no-console
		console.log(...args);
	}
};

/**
 * Global document manager to ensure Y.Doc instances are shared across components
 */
class YjsDocumentManager {
	private static instance: YjsDocumentManager;
	private documents: Map<
		string,
		{
			yDoc: Y.Doc;
			sharedType: Y.XmlText;
			indexeddbProvider?: IndexeddbPersistence;
			refCount: number;
			isSynced: boolean;
			persistenceError?: string;
			persistenceAvailable: boolean;
		}
	> = new Map();

	static getInstance(): YjsDocumentManager {
		if (!YjsDocumentManager.instance) {
			debugLog("Creating new YjsDocumentManager singleton instance");
			YjsDocumentManager.instance = new YjsDocumentManager();
		}
		return YjsDocumentManager.instance;
	}

	getDocument(
		documentId: string,
		options: {
			initialValue?: Descendant[];
			enablePersistence?: boolean;
			enableGarbageCollection?: boolean;
			recoverDocument?: (id: Id<"documents">) => Promise<Y.Doc | null>;
			createFallback?: () => Y.Doc;
		},
	) {
		let docInfo = this.documents.get(documentId);

		if (!docInfo) {
			debugLog(`Creating new shared Y.Doc for document: ${documentId}`);

			// Create a new Y.Doc instance
			const yDoc = new Y.Doc();

			// Configure garbage collection
			yDoc.gc = options.enableGarbageCollection ?? true;

			// Get the shared type for text content
			const sharedType = yDoc.get("content", Y.XmlText);

			docInfo = {
				yDoc,
				sharedType,
				refCount: 0,
				isSynced: false,
				persistenceAvailable: true,
			};
		} else {
			debugLog(`Reusing existing shared Y.Doc for document: ${documentId}`);
		}

		// Only set up persistence and initial value for new documents
		if (!this.documents.has(documentId)) {
			// Set up IndexedDB persistence if enabled
			if (options.enablePersistence) {
				this.setupPersistence(documentId, docInfo, options);
			} else {
				// If persistence is disabled, load initial value immediately
				if (
					docInfo.sharedType.length === 0 &&
					options.initialValue &&
					options.initialValue.length > 0
				) {
					debugLog("Loading initial value into shared Y.Doc (no persistence)");
					const initialValue = options.initialValue;
					docInfo.yDoc.transact(() => {
						docInfo.sharedType.applyDelta(
							slateNodesToInsertDelta(initialValue),
						);
					});
				}
				docInfo.isSynced = true;
				docInfo.persistenceAvailable = false;
			}

			this.documents.set(documentId, docInfo);
		}

		// Increment reference count
		docInfo.refCount++;
		debugLog(`Y.Doc reference count for ${documentId}: ${docInfo.refCount}`);

		return docInfo;
	}

	private async setupPersistence(
		documentId: string,
		docInfo: {
			yDoc: Y.Doc;
			sharedType: Y.XmlText;
			indexeddbProvider?: IndexeddbPersistence;
			refCount: number;
			isSynced: boolean;
			persistenceError?: string;
			persistenceAvailable: boolean;
		},
		options: {
			initialValue?: Descendant[];
			recoverDocument?: (id: Id<"documents">) => Promise<Y.Doc | null>;
			createFallback?: () => Y.Doc;
		},
	) {
		try {
			const indexeddbProvider = new IndexeddbPersistence(
				documentId,
				docInfo.yDoc,
			);
			docInfo.indexeddbProvider = indexeddbProvider;

			// Handle sync events
			indexeddbProvider.whenSynced
				.then(() => {
					debugLog(
						`Shared Y.Doc synced with IndexedDB for document: ${documentId}`,
					);
					docInfo.isSynced = true;
					docInfo.persistenceError = undefined;
					docInfo.persistenceAvailable = true;

					// Load initial value if the document is empty after sync
					if (
						docInfo.sharedType.length === 0 &&
						options.initialValue &&
						options.initialValue.length > 0
					) {
						debugLog("Loading initial value into empty shared Y.Doc");
						const initialValue = options.initialValue;
						docInfo.yDoc.transact(() => {
							docInfo.sharedType.applyDelta(
								slateNodesToInsertDelta(initialValue),
							);
						});
					}
				})
				.catch(async (error) => {
					console.error("IndexedDB sync failed for shared document:", error);
					const message =
						error instanceof Error
							? error.message
							: typeof error === "string"
								? error
								: JSON.stringify(error);

					// Attempt cloud-based recovery for corrupted documents
					if (message.includes("corrupt") || message.includes("invalid")) {
						debugLog(
							"Attempting to recover corrupted shared document from cloud...",
						);
						try {
							if (options.recoverDocument) {
								const recoveredDoc = await options.recoverDocument(
									documentId as Id<"documents">,
								);
								if (recoveredDoc) {
									// Apply recovered content to current document
									const recoveredState = Y.encodeStateAsUpdate(recoveredDoc);
									Y.applyUpdate(docInfo.yDoc, recoveredState);
									debugLog("Shared document recovery successful from cloud");
									docInfo.persistenceError =
										"Document was recovered from cloud. Some recent changes may have been lost.";
									recoveredDoc.destroy(); // Clean up recovered document
								} else if (options.createFallback) {
									// Create fallback document with recovery message
									const fallbackDoc = options.createFallback();
									const fallbackState = Y.encodeStateAsUpdate(fallbackDoc);
									Y.applyUpdate(docInfo.yDoc, fallbackState);
									debugLog(
										"Using fallback document with recovery message for shared doc",
									);
									docInfo.persistenceError =
										"Document recovery failed. Started with recovery message.";
									fallbackDoc.destroy(); // Clean up fallback document
								}
							}
						} catch (recoveryError) {
							console.error(
								"Cloud recovery failed for shared document:",
								recoveryError,
							);
							docInfo.persistenceError =
								"Document recovery failed. Starting with empty document.";
						}
					} else {
						docInfo.persistenceError = `Failed to sync with local storage: ${message}`;
					}

					docInfo.persistenceAvailable = false;
					// Still allow editing without persistence
					docInfo.isSynced = true;
				});

			// Handle IndexedDB errors
			indexeddbProvider.on("error", (error: Error) => {
				console.error("IndexedDB error for shared document:", error);
				if (error.name === "QuotaExceededError") {
					docInfo.persistenceError =
						"Local storage quota exceeded. Please free up space or clear old documents.";
				} else if (error.name === "InvalidStateError") {
					docInfo.persistenceError =
						"Local storage is unavailable. Changes will not be saved locally.";
				} else {
					docInfo.persistenceError = `Local storage error: ${error.message}`;
				}
				docInfo.persistenceAvailable = false;
			});
		} catch (error) {
			console.error(
				"Failed to initialize IndexedDB persistence for shared document:",
				error,
			);
			docInfo.persistenceError =
				"Failed to initialize local storage. Changes will not be saved locally.";
			docInfo.persistenceAvailable = false;
		}
	}

	releaseDocument(documentId: string) {
		const docInfo = this.documents.get(documentId);
		if (docInfo) {
			docInfo.refCount--;
			debugLog(`Y.Doc reference count for ${documentId}: ${docInfo.refCount}`);

			// Clean up document when no more references
			if (docInfo.refCount <= 0) {
				debugLog(`Cleaning up shared Y.Doc for document: ${documentId}`);

				// Clean up IndexedDB provider
				if (docInfo.indexeddbProvider) {
					docInfo.indexeddbProvider.destroy();
				}

				// Destroy the Y.Doc instance
				docInfo.yDoc.destroy();

				// Remove from map
				this.documents.delete(documentId);
			}
		}
	}
}

/**
 * Configuration options for the shared Yjs document hook
 */
interface UseSharedYjsDocumentOptions {
	/** Unique identifier for the document */
	documentId: string | Id<"documents">;
	/** Initial content to load if the document is empty */
	initialValue?: Descendant[];
	/** Whether to enable IndexedDB persistence */
	enablePersistence?: boolean;
	/** Whether to enable garbage collection (default: true) */
	enableGarbageCollection?: boolean;
}

/**
 * Return type for the useSharedYjsDocument hook
 */
interface UseSharedYjsDocumentReturn {
	/** The shared Y.Doc instance */
	yDoc: Y.Doc;
	/** The shared text type for collaborative editing */
	sharedType: Y.XmlText;
	/** IndexedDB persistence provider (if enabled) */
	indexeddbProvider?: IndexeddbPersistence;
	/** Whether the document is synced with IndexedDB */
	isSynced: boolean;
	/** Error state for persistence operations */
	persistenceError?: string;
	/** Whether persistence is available and working */
	persistenceAvailable: boolean;
}

/**
 * Custom hook to manage shared Y.Doc instances across multiple components
 *
 * This hook ensures that multiple editor instances for the same document
 * share the same Y.Doc instance, enabling proper collaborative editing.
 *
 * @param options Configuration options for the document
 * @returns Object containing shared Y.Doc, shared type, and persistence provider
 */
export const useSharedYjsDocument = (
	options: UseSharedYjsDocumentOptions,
): UseSharedYjsDocumentReturn => {
	const {
		documentId,
		initialValue = [{ type: "paragraph", children: [{ text: "" }] }],
		enablePersistence = true,
		enableGarbageCollection = true,
	} = options;

	// Track sync status and errors
	const [isSynced, setIsSynced] = useState(false);
	const [persistenceError, setPersistenceError] = useState<string | undefined>(
		undefined,
	);
	const [persistenceAvailable, setPersistenceAvailable] = useState(true);

	// Cloud recovery hook
	const { recoverDocument, createFallback } = useCloudRecovery();

	// Get shared document instance
	const documentManager = YjsDocumentManager.getInstance();
	// Normalize doc id once
	const docIdString =
		typeof documentId === "string" ? documentId : String(documentId);
	const prevDocIdRef = useRef(docIdString);

	// Synchronously acquire once on initial mount; subsequent identity changes handled in effect.
	const [docInfo, setDocInfo] = useState<
		ReturnType<YjsDocumentManager["getDocument"]>
	>(() => {
		return documentManager.getDocument(docIdString, {
			initialValue,
			enablePersistence,
			enableGarbageCollection,
			recoverDocument,
			createFallback,
		});
	});

	/* biome-ignore lint: Acquisition is intentionally keyed only by doc identity to prevent refCount leaks from option changes. */
	useEffect(() => {
		const prevId = prevDocIdRef.current;

		// Initial mount: already acquired by lazy initializer; only release on unmount
		if (prevId === docIdString) {
			return () => {
				debugLog(
					`Releasing shared Y.Doc reference for document: ${docIdString}`,
				);
				documentManager.releaseDocument(docIdString);
			};
		}

		// Identity changed: acquire new and release previous on cleanup
		const acquired = documentManager.getDocument(docIdString, {
			initialValue,
			enablePersistence,
			enableGarbageCollection,
			recoverDocument,
			createFallback,
		});
		setDocInfo(acquired);
		prevDocIdRef.current = docIdString;

		return () => {
			debugLog(`Releasing shared Y.Doc reference for document: ${prevId}`);
			documentManager.releaseDocument(prevId);
		};
	}, [docIdString]);

	// Update local state when document state changes
	useEffect(() => {
		// Reads latest manager-backed flags into React state
		const updateState = () => {
			setIsSynced(docInfo.isSynced);
			setPersistenceError(docInfo.persistenceError);
			setPersistenceAvailable(docInfo.persistenceAvailable);
		};

		// Initial state update to reflect current values immediately
		updateState();

		// Batch rapid event bursts (typing/remote updates) to avoid render churn.
		// Prefer animation frame; fall back to a microtask when RAF is unavailable (e.g., tests).
		let rafId: number | null = null;
		const scheduleUpdate = () => {
			if (rafId !== null) return;
			if (typeof requestAnimationFrame !== "undefined") {
				rafId = requestAnimationFrame(() => {
					rafId = null;
					updateState();
				});
			} else {
				queueMicrotask(() => {
					updateState();
				});
			}
		};

		const { yDoc, indexeddbProvider } = docInfo;

		// Y.Doc fires on both local edits and remote merges; keep hook state in sync.
		const onDocUpdate = () => {
			// Document content changed; reflect any related status updates.
			scheduleUpdate();
		};
		// afterTransaction helps catch batched structural changes as a single tick.
		const onAfterTransaction = () => {
			scheduleUpdate();
		};

		// Persistence provider events:
		// - "synced": initial load from IndexedDB completed
		// - "error": local persistence failed or became unavailable
		const onSynced = () => {
			scheduleUpdate();
		};
		const onPersistenceError = () => {
			scheduleUpdate();
		};

		// Register listeners
		yDoc.on("update", onDocUpdate);
		yDoc.on("afterTransaction", onAfterTransaction);
		indexeddbProvider?.on("synced", onSynced);
		indexeddbProvider?.on("error", onPersistenceError);

		// Cleanup all listeners to avoid leaks when hook unmounts or doc changes
		return () => {
			yDoc.off("update", onDocUpdate);
			yDoc.off("afterTransaction", onAfterTransaction);
			indexeddbProvider?.off("synced", onSynced);
			indexeddbProvider?.off("error", onPersistenceError);
			if (rafId !== null && typeof cancelAnimationFrame !== "undefined") {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
		};
	}, [docInfo]);

	const isDebug = process.env.NODE_ENV === "development";

	// Set up event listeners for debugging
	useEffect(() => {
		if (!isDebug) return;
		const { yDoc } = docInfo;
		const docIdString =
			typeof documentId === "string" ? documentId : String(documentId);

		const handleUpdate = (update: Uint8Array, origin: unknown) => {
			if (!isDebug) return;
			debugLog("Shared Y.Doc update received:", {
				documentId: docIdString,
				updateSize: update.length,
				origin: origin?.constructor?.name || origin,
				clientId: yDoc.clientID,
				timestamp: new Date().toISOString(),
			});
		};

		const handleAfterTransaction = (transaction: Y.Transaction) => {
			if (!isDebug) return;
			if (transaction.changed.size > 0) {
				debugLog("Shared Y.Doc transaction completed:", {
					documentId: docIdString,
					changedTypes: Array.from(transaction.changed.keys()).map(
						(type) => type.constructor.name,
					),
					origin: transaction.origin?.constructor?.name || transaction.origin,
				});
			}
		};

		// Add event listeners for debugging and monitoring
		yDoc.on("update", handleUpdate);
		yDoc.on("afterTransaction", handleAfterTransaction);

		// Cleanup function
		return () => {
			debugLog(
				`Cleaning up shared Y.Doc event listeners for document: ${docIdString}`,
			);
			yDoc.off("update", handleUpdate);
			yDoc.off("afterTransaction", handleAfterTransaction);
		};
	}, [docInfo, documentId, isDebug]);

	return {
		yDoc: docInfo.yDoc,
		sharedType: docInfo.sharedType,
		indexeddbProvider: docInfo.indexeddbProvider,
		isSynced,
		persistenceError,
		persistenceAvailable,
	};
};
