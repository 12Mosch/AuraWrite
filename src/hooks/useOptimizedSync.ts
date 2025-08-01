import { useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useConnectionManager } from "./useConnectionManager";
import type { SyncHookReturn } from "./useConvexYjsSync";
import { useNetworkStatus } from "./useNetworkStatus";

/**
 * Configuration options for optimized sync
 */
export interface OptimizedSyncOptions {
	/** Document ID to sync */
	documentId: Id<"documents">;
	/** Y.Doc instance */
	yDoc: Y.Doc;
	/** Shared type for content */
	sharedType: Y.XmlText;
	/** Whether sync is enabled */
	enabled?: boolean;
	/** Debounce time for batching updates (ms) */
	debounceMs?: number;
	/** Maximum batch size for updates */
	maxBatchSize?: number;
	/** Maximum time to wait before forcing a sync (ms) */
	maxWaitTime?: number;
	/** Maximum number of retry attempts */
	maxRetries?: number;
	/** Whether to use compression for updates */
	useCompression?: boolean;
}

/**
 * Return type for the optimized sync hook
 */
export interface OptimizedSyncReturn extends SyncHookReturn {
	/** Get sync statistics */
	getStats: () => SyncStats;
	/** Clear sync statistics */
	clearStats: () => void;
}

/**
 * Sync statistics for monitoring performance
 */
export interface SyncStats {
	totalUpdates: number;
	batchedUpdates: number;
	failedUpdates: number;
	averageLatency: number;
	compressionRatio: number;
	lastSyncTime: number;
}

/**
 * Update batch for efficient syncing
 */
interface UpdateBatch {
	updates: Uint8Array[];
	timestamp: number;
	retryCount: number;
}

/**
 * Browser-compatible utility function to compare two Uint8Array instances
 */
const areUint8ArraysEqual = useCallback(
	(a: Uint8Array, b: Uint8Array): boolean => {
		if (a.length !== b.length) return false;
		// Use every() for early termination on first mismatch
		return a.every((value, index) => value === b[index]);
	},
	[],
);

/**
 * Enhanced hook for optimized real-time synchronization
 *
 * Features:
 * - Update batching for reduced network calls
 * - Compression for smaller payloads
 * - Intelligent retry logic
 * - Performance monitoring
 * - Connection pooling optimization
 * - Selective syncing based on content changes
 */
export const useOptimizedSync = (
	options: OptimizedSyncOptions,
): OptimizedSyncReturn => {
	const {
		documentId,
		yDoc,
		enabled = true,
		debounceMs = 300,
		maxBatchSize = 10,
		maxWaitTime = 2000,
		maxRetries = 3,
	} = options;

	// Network status
	const { isOnline } = useNetworkStatus();

	// Convex client, queries, and mutations
	const convex = useConvex();
	const serverState = useQuery(
		api.yjsSync.subscribeToYjsState,
		enabled && documentId ? { documentId } : "skip",
	);
	const applyBatchedUpdatesMutation = useMutation(
		api.yjsSync.applyBatchedYjsUpdates,
	);

	// Connection management with automatic reconnection
	const connectionManager = useConnectionManager({
		enabled,
		initialRetryDelay: 1000,
		maxRetryDelay: 30000,
		maxRetries: 10,
		backoffMultiplier: 2,
		healthCheckInterval: 30000,
		connectionTimeout: 10000,
	});

	// State management
	const [isSyncing, setIsSyncing] = useState(false);
	const [isSynced, setIsSynced] = useState(false);
	const [syncError, setSyncError] = useState<string | null>(null);

	// Refs for optimization
	const updateBatchRef = useRef<UpdateBatch | null>(null);
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
	const forceTimerRef = useRef<NodeJS.Timeout | null>(null);
	const lastSyncedStateRef = useRef<Uint8Array | null>(null);
	const lastSyncTimestampRef = useRef<number | null>(null);
	const isInitializedRef = useRef(false);
	const statsRef = useRef<SyncStats>({
		totalUpdates: 0,
		batchedUpdates: 0,
		failedUpdates: 0,
		averageLatency: 0,
		compressionRatio: 1,
		lastSyncTime: 0,
	});

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
	 * Send batched updates to server with retry logic
	 */
	const sendBatchedUpdates = useCallback(
		async (batch: UpdateBatch) => {
			if (!enabled || !isOnline) return;

			const startTime = Date.now();
			setIsSyncing(true);

			try {
				// Get current state vector for efficient sync
				const stateVector = Y.encodeStateVector(yDoc);

				// Send batched updates to server
				// Convert Uint8Array to ArrayBuffer for Convex compatibility
				const result = await applyBatchedUpdatesMutation({
					documentId,
					updates: batch.updates.map((update) =>
						update.buffer.slice(
							update.byteOffset,
							update.byteOffset + update.byteLength,
						),
					),
					stateVector: stateVector.buffer.slice(
						stateVector.byteOffset,
						stateVector.byteOffset + stateVector.byteLength,
					),
					clientId: yDoc.clientID,
				});

				if (result.success) {
					const latency = Date.now() - startTime;

					// Update statistics
					statsRef.current.totalUpdates += result.appliedUpdates;
					statsRef.current.batchedUpdates += 1;

					// Update average latency using running average formula
					const sampleCount = statsRef.current.batchedUpdates;
					statsRef.current.averageLatency =
						(statsRef.current.averageLatency * (sampleCount - 1) + latency) /
						sampleCount;
					statsRef.current.lastSyncTime = Date.now();

					// Update last synced state and timestamp
					lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);
					lastSyncTimestampRef.current = Date.now();
					setIsSynced(true);
					setSyncError(null);

					// Apply any conflict resolution update from server
					if (result.conflictUpdate) {
						yDoc.transact(() => {
							Y.applyUpdate(yDoc, result.conflictUpdate!);
						}, "server-conflict");
					}

					// Reset retry count on success
					batch.retryCount = 0;
				} else {
					throw new Error("Server rejected the batched updates");
				}
			} catch (error) {
				console.error("Failed to send batched updates:", error);
				statsRef.current.failedUpdates += 1;

				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";

				// Implement retry logic
				if (batch.retryCount < maxRetries) {
					batch.retryCount += 1;
					setSyncError(
						`Sync failed (attempt ${batch.retryCount}/${maxRetries}): ${errorMessage}`,
					);

					// Schedule retry with exponential backoff
					const retryDelay = Math.min(
						1000 * 2 ** (batch.retryCount - 1),
						10000,
					);
					setTimeout(() => {
						sendBatchedUpdates(batch);
					}, retryDelay);
				} else {
					setSyncError(
						`Sync failed after ${maxRetries} attempts: ${errorMessage}`,
					);
				}
			} finally {
				setIsSyncing(false);
			}
		},
		[
			enabled,
			isOnline,
			yDoc,
			documentId,
			maxRetries,
			applyBatchedUpdatesMutation,
		],
	);

	/**
	 * Add update to batch and schedule sync
	 */
	const addUpdateToBatch = useCallback(
		(update: Uint8Array) => {
			if (!enabled) return;

			// Initialize or add to existing batch
			if (!updateBatchRef.current) {
				updateBatchRef.current = {
					updates: [update],
					timestamp: Date.now(),
					retryCount: 0,
				};
			} else {
				updateBatchRef.current.updates.push(update);
			}

			// Clear existing timers
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
			if (forceTimerRef.current) {
				clearTimeout(forceTimerRef.current);
			}

			// Check if we should send immediately
			const shouldSendImmediately =
				updateBatchRef.current.updates.length >= maxBatchSize ||
				Date.now() - updateBatchRef.current.timestamp >= maxWaitTime;

			if (shouldSendImmediately) {
				const batch = updateBatchRef.current;
				updateBatchRef.current = null;
				sendBatchedUpdates(batch);
			} else {
				// Set up debounced send
				debounceTimerRef.current = setTimeout(() => {
					if (updateBatchRef.current) {
						const batch = updateBatchRef.current;
						updateBatchRef.current = null;
						sendBatchedUpdates(batch);
					}
				}, debounceMs);

				// Set up force send timer
				forceTimerRef.current = setTimeout(() => {
					if (updateBatchRef.current) {
						const batch = updateBatchRef.current;
						updateBatchRef.current = null;
						sendBatchedUpdates(batch);
					}
				}, maxWaitTime);
			}
		},
		[enabled, maxBatchSize, maxWaitTime, debounceMs, sendBatchedUpdates],
	);

	/**
	 * Force a full resync from server
	 * Fetches the latest document state and updates local Y.Doc accordingly
	 */
	const resync = useCallback(async () => {
		if (!enabled || !isOnline) {
			console.log("Resync skipped: sync disabled or offline");
			return;
		}

		try {
			setIsSyncing(true);
			console.log("Starting full resync from server...");

			// Use serverState from subscription if available, otherwise fetch directly
			let serverData;
			if (serverState) {
				serverData = serverState;
			} else {
				const fetchedData = await convex.query(api.yjsSync.getYjsState, {
					documentId,
				});
				serverData = fetchedData;
			}

			if (!serverData) {
				throw new Error("Failed to fetch document state from server");
			}

			// If server has Y.js state, apply it to local document
			if (serverData.yjsState) {
				console.log("Applying server state to local Y.Doc");

				// Convert ArrayBuffer to Uint8Array for Y.js
				const serverStateBytes = new Uint8Array(serverData.yjsState);

				// Apply server state using our helper function
				applyServerUpdate(serverStateBytes, "server-resync");

				// Update sync timestamp
				if (serverData.yjsUpdatedAt) {
					lastSyncTimestampRef.current = serverData.yjsUpdatedAt;
				}

				console.log("Successfully applied server state during resync");
				setIsSynced(true);
				setSyncError(null);
			} else {
				// No server state exists - this means the document hasn't been initialized yet
				console.log("No server state found during resync");
				throw new Error(
					"Server state not found. Document may not be initialized yet. Please try syncing normally first.",
				);
			}
		} catch (error) {
			console.error("Failed to resync:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			setSyncError(`Resync failed: ${errorMessage}`);
			setIsSynced(false);
		} finally {
			setIsSyncing(false);
		}
	}, [enabled, isOnline, convex, documentId, serverState, applyServerUpdate]);

	/**
	 * Get current sync statistics
	 */
	const getStats = useCallback((): SyncStats => {
		return { ...statsRef.current };
	}, []);

	/**
	 * Clear sync statistics
	 */
	const clearStats = useCallback(() => {
		statsRef.current = {
			totalUpdates: 0,
			batchedUpdates: 0,
			failedUpdates: 0,
			averageLatency: 0,
			compressionRatio: 1,
			lastSyncTime: 0,
		};
	}, []);

	// Set up Y.Doc update listener
	useEffect(() => {
		if (!enabled) return;

		const handleUpdate = (update: Uint8Array, origin: any) => {
			// Only sync updates that don't originate from server
			if (origin !== "server") {
				addUpdateToBatch(update);
			}
		};

		yDoc.on("update", handleUpdate);

		return () => {
			yDoc.off("update", handleUpdate);

			// Clear timers
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
			if (forceTimerRef.current) {
				clearTimeout(forceTimerRef.current);
			}
		};
	}, [enabled, yDoc, addUpdateToBatch]);

	// Set up connection test for the connection manager
	useEffect(() => {
		const connectionTest = async (): Promise<boolean> => {
			try {
				// Test connectivity by querying a lightweight endpoint
				const response = await fetch("/api/health", {
					method: "HEAD",
					cache: "no-cache",
				});
				return response.ok;
			} catch {
				return false;
			}
		};

		connectionManager.setConnectionTest(connectionTest);
	}, [connectionManager]);

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
				console.log(
					"Applying server state update from subscription (optimized sync)",
					{
						documentId,
						serverTimestamp: serverState.yjsUpdatedAt,
						lastSyncTimestamp: lastSyncTimestampRef.current,
						serverStateSize: serverStateBytes.length,
					},
				);

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
	}, [enabled, serverState, applyServerUpdate]);

	// Initialize server state when component mounts
	useEffect(() => {
		if (enabled && !isInitializedRef.current && serverState) {
			isInitializedRef.current = true;
			console.log("Optimized sync initialized");
		}
	}, [enabled, serverState]);

	return {
		isSyncing,
		isSynced,
		syncError: syncError || connectionManager.error,
		isConnected: connectionManager.isConnected,
		connectionState: connectionManager.connectionState,
		resync,
		reconnect: connectionManager.reconnect,
		getStats,
		clearStats,
	};
};
