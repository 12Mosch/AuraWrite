import { withYjs, YjsEditor } from "@slate-yjs/core";
import type React from "react";
import { useEffect, useMemo } from "react";
import { createEditor, type Descendant, Editor } from "slate";
import { Editable, Slate, withReact } from "slate-react";
import type { Id } from "../../convex/_generated/dataModel";
import { useError } from "../contexts/ErrorContext";
import { ConnectionState } from "../hooks/useConnectionManager";
import {
	type SyncHookReturn,
	useConvexYjsSync,
} from "../hooks/useConvexYjsSync";
import { useOfflineMode } from "../hooks/useOfflineMode";
import { useOptimizedSync as useOptimizedSyncHook } from "../hooks/useOptimizedSync";
import { usePresence } from "../hooks/usePresence";
import { useSharedYjsDocument } from "../hooks/useSharedYjsDocument";
import {
	ConnectionStatus,
	SimpleConnectionIndicator,
} from "./ConnectionStatus";
import { DocumentHeader } from "./DocumentHeader";
import { EnhancedErrorDisplay } from "./EnhancedErrorDisplay";
import { PresenceIndicator } from "./PresenceIndicator";
import {
	CompactPerformanceIndicator,
	SyncPerformanceMonitor,
} from "./SyncPerformanceMonitor";

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
	/** Whether to enable real-time synchronization */
	enableSync?: boolean;
	/** Whether to show the document header with real-time metadata */
	showHeader?: boolean;
	/** CSS class name for the header */
	headerClassName?: string;
	/** Whether to use optimized sync (default: true) */
	useOptimizedSync?: boolean;
	/** Whether to show performance monitoring (default: false) */
	showPerformanceMonitor?: boolean;
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
	enableSync = true,
	showHeader = true,
	headerClassName = "",
	useOptimizedSync = true,
	showPerformanceMonitor = false,
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
		persistenceAvailable,
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
		connectionState = ConnectionState.CONNECTED, // Provide default value for optional property
		reconnect = () => {}, // Provide default no-op function for optional property
	} = syncHook;

	// Initialize real-time presence tracking
	const { updatePresence } = usePresence(documentId, {
		enabled: enableSync,
		updateInterval: 5000,
		trackCursor: true,
		trackSelection: true,
	});

	// Create Slate editor with Yjs integration
	const editor = useMemo(() => {
		const e = withReact(withYjs(createEditor(), sharedType));

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

	// Get editor value from Y.js shared type instead of maintaining separate state
	const value = useMemo(() => {
		if (!isLocalSynced) {
			return initialValue;
		}

		// Get the current value from the Y.js shared type
		try {
			return editor.children.length > 0 ? editor.children : initialValue;
		} catch (error) {
			console.warn("Error getting editor value from Y.js:", error);
			return initialValue;
		}
	}, [editor, isLocalSynced, initialValue]);

	// Connect/disconnect the Yjs editor
	useEffect(() => {
		// Only connect after the shared document is synced
		if (!isLocalSynced) {
			console.log("Waiting for Y.Doc to sync before connecting editor...");
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
			try {
				console.log(
					"Disconnecting Y.js editor from shared document:",
					documentId,
				);
				YjsEditor.disconnect(editor);
			} catch (error) {
				console.warn("Error disconnecting Y.js editor:", error);
			}
		};
	}, [editor, indexeddbProvider, isLocalSynced, documentId]);

	// Handle Y.js updates to prevent DOM sync issues
	useEffect(() => {
		if (!sharedType || !isLocalSynced) return;

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
		if (enableSync) {
			try {
				if (editor.selection) {
					updatePresence(undefined, editor.selection);
				}
			} catch (error) {
				console.warn("Error updating presence:", error);
			}
		}
	};

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

	// Sync status indicator component
	const SyncStatusIndicator = () => {
		const getStatusColor = () => {
			switch (overallSyncStatus) {
				case "synced":
					return "text-green-600";
				case "syncing":
					return "text-blue-600";
				case "error":
					return "text-red-600";
				case "offline":
					return "text-yellow-600";
				case "pending":
					return "text-gray-600";
				case "disabled":
					return "text-gray-400";
				default:
					return "text-gray-600";
			}
		};

		const getStatusText = () => {
			switch (overallSyncStatus) {
				case "synced":
					return "Synced";
				case "syncing":
					return "Syncing...";
				case "error":
					return "Sync Error";
				case "offline":
					return "Offline";
				case "pending":
					return "Connecting...";
				case "disabled":
					return "Sync Disabled";
				default:
					return "Unknown";
			}
		};

		return (
			<div className={`text-xs ${getStatusColor()} flex items-center gap-1`}>
				<div
					className={`w-2 h-2 rounded-full ${
						overallSyncStatus === "synced"
							? "bg-green-600"
							: overallSyncStatus === "syncing"
								? "bg-blue-600 animate-pulse"
								: overallSyncStatus === "error"
									? "bg-red-600"
									: overallSyncStatus === "offline"
										? "bg-yellow-600"
										: "bg-gray-600"
					}`}
				/>
				{getStatusText()}
			</div>
		);
	};

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

			{/* Status bar */}
			<div className="flex items-center justify-between p-2 bg-gray-50 border-b">
				<div className="flex items-center space-x-4">
					<SyncStatusIndicator />
					{/* Real-time Presence Indicator */}
					<PresenceIndicator
						documentId={documentId}
						size="sm"
						maxVisible={3}
						showNames={false}
					/>

					{/* Performance Monitor (compact) */}
					{useOptimizedSync && (
						<CompactPerformanceIndicator
							getStats={optimizedSyncHook.getStats}
						/>
					)}

					{/* Connection Status */}
					<SimpleConnectionIndicator
						connectionState={connectionState}
						isSyncing={isSyncing}
					/>
				</div>
				<div className="flex items-center gap-2 text-xs text-gray-500">
					{!persistenceAvailable && (
						<span className="text-yellow-600">⚠ Local storage unavailable</span>
					)}
					<span>Document: {documentId}</span>
				</div>
			</div>

			{/* Error display */}
			<EnhancedErrorDisplay
				syncError={syncError}
				persistenceError={persistenceError}
				hasGlobalError={!!globalError}
				resync={resync}
				isConnected={isConnected}
				reconnect={reconnect}
				isSyncing={isSyncing}
				offlineMode={offlineMode}
			/>

			{/* Editor */}
			<div className="relative">
				<Slate
					key={documentId} // Force re-render when document changes
					editor={editor}
					value={value}
					onChange={handleChange}
				>
					<Editable
						placeholder={placeholder}
						className="min-h-[200px] p-4 focus:outline-none"
						spellCheck
						autoFocus
					/>
				</Slate>

				{/* Loading overlay */}
				{!isLocalSynced && (
					<div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
						<div className="text-gray-600">Loading document...</div>
					</div>
				)}
			</div>

			{/* Performance Monitor (detailed) */}
			{showPerformanceMonitor && useOptimizedSync && (
				<SyncPerformanceMonitor
					getStats={optimizedSyncHook.getStats}
					clearStats={optimizedSyncHook.clearStats}
					visible={true}
					updateInterval={1000}
				/>
			)}

			{/* Enhanced Connection Status (development) */}
			{process.env.NODE_ENV === "development" && (
				<div className="border-t">
					<ConnectionStatus
						connectionState={connectionState}
						isSyncing={isSyncing}
						error={syncError}
						onReconnect={reconnect}
						showDetails={true}
						size="sm"
						className="m-2"
					/>

					<div className="p-2 bg-gray-100 text-xs text-gray-600 space-y-1">
						<div>Local synced: {isLocalSynced ? "✓" : "✗"}</div>
						<div>Server synced: {isServerSynced ? "✓" : "✗"}</div>
						<div>Y.Doc client ID: {yDoc.clientID}</div>
						<div>Sync mode: {useOptimizedSync ? "Optimized" : "Regular"}</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default ConvexCollaborativeEditor;
