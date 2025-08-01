import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConnectionState } from "./useConnectionManager";
import { useNetworkStatus } from "./useNetworkStatus";

/**
 * Configuration options for Convex-Yjs synchronization
 */
interface UseConvexYjsSyncOptions {
	/** Document ID to synchronize */
	documentId: Id<"documents">;
	/** Y.Doc instance to synchronize */
	yDoc: Y.Doc;
	/** Shared type within the Y.Doc (e.g., Y.XmlText) */
	sharedType: Y.XmlText;
	/** Debounce delay for sending updates to server (ms) */
	debounceMs?: number;
	/** Whether to enable automatic synchronization */
	enabled?: boolean;
	/** Maximum retry attempts for failed sync operations */
	maxRetries?: number;
}

/**
 * Common interface for sync hooks to ensure type compatibility
 */
export interface SyncHookReturn {
	/** Whether the hook is currently syncing with the server */
	isSyncing: boolean;
	/** Whether the document is fully synchronized */
	isSynced: boolean;
	/** Any synchronization error that occurred */
	syncError: string | null;
	/** Connection status */
	isConnected: boolean;
	/** Force a full resync from server */
	resync: () => Promise<void>;
	/** Connection state (optional for compatibility) */
	connectionState?: ConnectionState;
	/** Force reconnection (optional for compatibility) */
	reconnect?: () => void;
}

/**
 * Return type for the useConvexYjsSync hook
 */
interface UseConvexYjsSyncReturn extends SyncHookReturn {
	/** Manual sync function */
	sync: () => Promise<void>;
}

/**
 * Custom React hook for synchronizing Y.Doc with Convex backend
 *
 * This hook provides bidirectional synchronization between a Y.Doc instance
 * and the Convex backend, handling:
 * - Real-time updates from server to client
 * - Debounced updates from client to server
 * - Conflict resolution using Y.Doc's CRDT capabilities
 * - Connection management and offline support
 * - Error handling and retry logic
 *
 * @param options Configuration options for synchronization
 * @returns Synchronization state and control functions
 */
export const useConvexYjsSync = (
	options: UseConvexYjsSyncOptions,
): UseConvexYjsSyncReturn => {
	const {
		documentId,
		yDoc,
		debounceMs = 500,
		enabled = true,
		maxRetries = 3,
	} = options;

	// Network status
	const { isOnline } = useNetworkStatus();

	// Convex hooks - Use the subscription query for real-time updates
	const serverState = useQuery(
		api.yjsSync.subscribeToYjsState,
		enabled && documentId ? { documentId } : "skip",
	);
	const initializeYjsStateMutation = useMutation(
		api.yjsSync.initializeYjsState,
	);
	const updateYjsStateMutation = useMutation(api.yjsSync.updateYjsState);
	// Note: subscribeToYjsState automatically re-runs when server state changes

	// State management
	const [isSyncing, setIsSyncing] = useState(false);
	const [isSynced, setIsSynced] = useState(false);
	const [syncError, setSyncError] = useState<string | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const [connectionState, setConnectionState] = useState<ConnectionState>(
		ConnectionState.DISCONNECTED,
	);

	// Refs for managing sync state
	const lastSyncedStateRef = useRef<Uint8Array | null>(null);
	const lastSyncTimestampRef = useRef<number | null>(null);
	const pendingUpdatesRef = useRef<Uint8Array[]>([]);
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
	const retryCountRef = useRef(0);
	const isInitializedRef = useRef(false);

	/**
	 * Derive connection state from sync hook's internal state
	 */
	const deriveConnectionState = useCallback(
		(
			isOnline: boolean,
			isSyncing: boolean,
			syncError: string | null,
			retryCount: number,
			maxRetries: number,
			isInitialized: boolean,
		): ConnectionState => {
			if (!enabled) {
				return ConnectionState.DISCONNECTED;
			}

			if (!isOnline) {
				return ConnectionState.DISCONNECTED;
			}

			if (syncError) {
				if (retryCount >= maxRetries) {
					return ConnectionState.FAILED;
				}
				return retryCount > 0
					? ConnectionState.RECONNECTING
					: ConnectionState.CONNECTING;
			}

			if (isSyncing) {
				return retryCount > 0
					? ConnectionState.RECONNECTING
					: ConnectionState.CONNECTING;
			}

			if (isInitialized && !syncError) {
				return ConnectionState.CONNECTED;
			}

			return ConnectionState.DISCONNECTED;
		},
		[enabled],
	);

	/**
	 * Initialize Y.Doc state on the server if it doesn't exist
	 */
	const initializeServerState = useCallback(async () => {
		if (!enabled || isInitializedRef.current || !documentId) return;

		try {
			setIsSyncing(true);

			// Get current Y.Doc state and state vector
			const currentState = Y.encodeStateAsUpdate(yDoc);
			const stateVector = Y.encodeStateVector(yDoc);

			// Try to initialize the server state
			// Convert Uint8Array to ArrayBuffer for Convex compatibility
			const wasInitialized = await initializeYjsStateMutation({
				documentId,
				initialState: currentState.buffer.slice(
					currentState.byteOffset,
					currentState.byteOffset + currentState.byteLength,
				),
				stateVector: stateVector.buffer.slice(
					stateVector.byteOffset,
					stateVector.byteOffset + stateVector.byteLength,
				),
			});

			if (wasInitialized) {
				console.log("Y.Doc state initialized on server");
				lastSyncedStateRef.current = currentState;
				setIsSynced(true);
			} else {
				console.log(
					"Y.Doc state already exists on server, will sync with subscription",
				);
				// Server already has state, the subscription will handle syncing
				setIsSynced(false);
			}

			isInitializedRef.current = true;
			setSyncError(null);
		} catch (error) {
			console.error("Failed to initialize server state:", error);
			setSyncError(
				`Failed to initialize: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsSyncing(false);
		}
	}, [yDoc, enabled, documentId, initializeYjsStateMutation]);

	/**
	 * Apply server updates to local Y.Doc with conflict resolution
	 */
	const applyServerUpdate = useCallback(
		(serverState: Uint8Array, origin: string = "server") => {
			if (!serverState || serverState.length === 0) return;

			try {
				// Create a test document to see if applying the server state would change anything
				const testDoc = new Y.Doc();

				// First apply our current state to the test doc
				const currentState = Y.encodeStateAsUpdate(yDoc);
				Y.applyUpdate(testDoc, currentState);

				// Get the content before applying server update
				const contentBefore = testDoc.get("content", Y.XmlText).toString();

				// Now apply the server state
				Y.applyUpdate(testDoc, serverState);

				// Get the content after applying server update
				const contentAfter = testDoc.get("content", Y.XmlText).toString();

				// Check if the content actually changed
				const hasNewContent = contentBefore !== contentAfter;

				console.log("Checking if server update should be applied:", {
					documentId,
					origin,
					contentBefore:
						contentBefore.substring(0, 100) +
						(contentBefore.length > 100 ? "..." : ""),
					contentAfter:
						contentAfter.substring(0, 100) +
						(contentAfter.length > 100 ? "..." : ""),
					hasNewContent,
					currentStateSize: currentState.length,
					serverStateSize: serverState.length,
				});

				// Clean up test document
				testDoc.destroy();

				if (!hasNewContent) {
					console.log("Server state would not change content, skipping update");
					return;
				}

				console.log("Applying server update to Y.Doc", {
					origin,
					currentStateSize: currentState.length,
					serverStateSize: serverState.length,
					documentId,
				});

				// Apply the server update with origin tracking
				yDoc.transact(() => {
					Y.applyUpdate(yDoc, serverState);
				}, origin);

				lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);

				console.log("Successfully applied server update to Y.Doc");
				setIsSynced(true);
				setSyncError(null);
			} catch (error) {
				console.error("Failed to apply server update:", error);
				setSyncError(
					`Failed to apply update: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		},
		[yDoc, documentId],
	);

	/**
	 * Send local updates to server with debouncing
	 */
	const sendUpdateToServer = useCallback(
		async (update: Uint8Array) => {
			if (!enabled || !isOnline || !documentId) return;

			try {
				setIsSyncing(true);

				// Get current state vector for efficient sync
				const stateVector = Y.encodeStateVector(yDoc);

				// Send update to server
				// Convert Uint8Array to ArrayBuffer for Convex compatibility
				const result = await updateYjsStateMutation({
					documentId,
					update: update.buffer.slice(
						update.byteOffset,
						update.byteOffset + update.byteLength,
					),
					stateVector: stateVector.buffer.slice(
						stateVector.byteOffset,
						stateVector.byteOffset + stateVector.byteLength,
					),
				});

				if (result.success) {
					lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);
					lastSyncTimestampRef.current = Date.now(); // Track when we last sent an update
					retryCountRef.current = 0;
					setSyncError(null);
					setIsSynced(true);

					// Apply any conflict resolution update from server
					if (result.conflictUpdate) {
						applyServerUpdate(result.conflictUpdate, "server-conflict");
					}
				} else {
					throw new Error("Server rejected the update");
				}
			} catch (error) {
				console.error("Failed to send update to server:", error);

				// Implement retry logic
				if (retryCountRef.current < maxRetries) {
					retryCountRef.current++;
					setTimeout(
						() => sendUpdateToServer(update),
						1000 * retryCountRef.current,
					);
				} else {
					setSyncError(
						`Sync failed after ${maxRetries} retries: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
			} finally {
				setIsSyncing(false);
			}
		},
		[
			yDoc,
			enabled,
			isOnline,
			documentId,
			maxRetries,
			updateYjsStateMutation,
			applyServerUpdate,
		],
	);

	/**
	 * Debounced function to send updates to server
	 */
	const debouncedSendUpdate = useCallback(
		(update: Uint8Array) => {
			// Add update to pending queue
			pendingUpdatesRef.current.push(update);

			// Clear existing timer
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}

			// Set new timer
			debounceTimerRef.current = setTimeout(() => {
				if (pendingUpdatesRef.current.length > 0) {
					// Merge all pending updates
					const mergedUpdate = Y.mergeUpdates(pendingUpdatesRef.current);
					pendingUpdatesRef.current = [];
					sendUpdateToServer(mergedUpdate);
				}
			}, debounceMs);
		},
		[sendUpdateToServer, debounceMs],
	);

	/**
	 * Manual sync function
	 */
	const sync = useCallback(async () => {
		if (!enabled) return;

		try {
			setIsSyncing(true);
			const currentState = Y.encodeStateAsUpdate(yDoc);
			await sendUpdateToServer(currentState);
		} finally {
			setIsSyncing(false);
		}
	}, [enabled, yDoc, sendUpdateToServer]);

	/**
	 * Force a full resync from server
	 */
	const resync = useCallback(async () => {
		if (!enabled || !documentId) return;

		try {
			setIsSyncing(true);

			// For resync, we'll rely on the serverState from our subscription
			// If serverState is available, apply it; otherwise initialize
			if (serverState?.yjsState) {
				// Apply the server state to our local Y.Doc
				// Convert ArrayBuffer to Uint8Array
				const serverStateBytes = new Uint8Array(serverState.yjsState);
				applyServerUpdate(serverStateBytes, "server-resync");
				console.log("Successfully resynced with server state");
				setIsSynced(true);
			} else {
				// No server state exists, initialize it with our current state
				console.log("No server state found, initializing...");
				await initializeServerState();
			}

			setSyncError(null);
		} catch (error) {
			console.error("Failed to resync:", error);
			setSyncError(
				`Resync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsSyncing(false);
		}
	}, [
		enabled,
		documentId,
		serverState,
		applyServerUpdate,
		initializeServerState,
	]);

	/**
	 * Reconnect function that attempts to re-establish sync
	 */
	const reconnect = useCallback(async () => {
		if (!enabled) {
			console.log("Reconnect called but sync is disabled");
			return;
		}

		console.log("Attempting to reconnect...");

		// Reset retry count and error state
		retryCountRef.current = 0;
		setSyncError(null);

		// Update connection state to show we're attempting to reconnect
		setConnectionState(ConnectionState.CONNECTING);

		try {
			// Attempt to resync with the server
			await resync();
			console.log("Reconnection successful");
		} catch (error) {
			console.error("Reconnection failed:", error);
			setSyncError(
				`Reconnection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			setConnectionState(ConnectionState.FAILED);
		}
	}, [enabled, resync]);

	// Initialize server state when component mounts
	useEffect(() => {
		if (enabled && !isInitializedRef.current) {
			initializeServerState();
		}
	}, [enabled, initializeServerState]);

	// Handle real-time server state updates
	useEffect(() => {
		if (!enabled || !serverState) return;

		// Apply server updates when they arrive
		if (serverState.yjsState && isInitializedRef.current) {
			const serverStateBytes = new Uint8Array(serverState.yjsState);

			// Check if server state is newer than our last sync
			const shouldApplyUpdate =
				!lastSyncTimestampRef.current ||
				(serverState.yjsUpdatedAt &&
					serverState.yjsUpdatedAt > lastSyncTimestampRef.current);

			if (shouldApplyUpdate) {
				console.log("Applying server state update from subscription", {
					documentId,
					serverTimestamp: serverState.yjsUpdatedAt,
					lastSyncTimestamp: lastSyncTimestampRef.current,
					serverStateSize: serverStateBytes.length,
				});

				// Apply the server update
				applyServerUpdate(serverStateBytes, "server-subscription");

				// Update our sync timestamp
				if (serverState.yjsUpdatedAt) {
					lastSyncTimestampRef.current = serverState.yjsUpdatedAt;
				}
			} else {
				console.log("Skipping server state update (not newer)", {
					documentId,
					serverTimestamp: serverState.yjsUpdatedAt,
					lastSyncTimestamp: lastSyncTimestampRef.current,
				});
			}
		}

		setIsConnected(true);
	}, [enabled, serverState, applyServerUpdate, documentId]);

	// Set up Y.Doc update listener
	useEffect(() => {
		if (!enabled) return;

		const handleUpdate = (update: Uint8Array, origin: unknown) => {
			// Only sync updates that don't originate from server
			if (origin !== "server") {
				debouncedSendUpdate(update);
			}
		};

		yDoc.on("update", handleUpdate);

		return () => {
			yDoc.off("update", handleUpdate);

			// Clear debounce timer
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, [enabled, yDoc, debouncedSendUpdate]);

	// Update connection status and state based on network and sync state
	useEffect(() => {
		const newConnectionState = deriveConnectionState(
			isOnline,
			isSyncing,
			syncError,
			retryCountRef.current,
			maxRetries,
			isInitializedRef.current,
		);

		setConnectionState(newConnectionState);
		setIsConnected(newConnectionState === ConnectionState.CONNECTED);
	}, [isOnline, isSyncing, syncError, maxRetries, deriveConnectionState]);

	return {
		isSyncing,
		isSynced,
		syncError,
		isConnected,
		sync,
		resync,
		// Dynamic connection state and reconnect functionality
		connectionState,
		reconnect,
	};
};
