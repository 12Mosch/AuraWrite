import React from "react";
import { ErrorDisplay } from "./ErrorDisplay";

/**
 * Props for the EnhancedErrorDisplay component
 */
interface EnhancedErrorDisplayProps {
	/** Sync error message */
	syncError: string | null;
	/** Persistence error message */
	persistenceError?: string;
	/** Whether there's a global error */
	hasGlobalError: boolean;
	/** Function to retry sync */
	resync: () => Promise<void>;
	/** Whether currently connected */
	isConnected: boolean;
	/** Function to reconnect */
	reconnect?: () => void;
	/** Whether currently syncing */
	isSyncing: boolean;
	/** Offline mode state */
	offlineMode: {
		isOffline: boolean;
		hasUnsyncedChanges: boolean;
		pendingOperations: number;
		forceSync: () => void;
		isSyncing: boolean;
	};
}

/**
 * Enhanced error display component for collaborative editor
 *
 * Displays:
 * - Global errors from the error context
 * - Local sync and persistence errors
 * - Offline mode indicators
 * - Action buttons for recovery
 */
export const EnhancedErrorDisplay: React.FC<EnhancedErrorDisplayProps> =
	React.memo(
		({
			syncError,
			persistenceError,
			hasGlobalError,
			resync,
			isConnected,
			reconnect,
			isSyncing,
			offlineMode,
		}) => {
			// Show global errors or local sync/persistence errors
			const hasLocalErrors = syncError || persistenceError;

			if (!hasLocalErrors && !hasGlobalError) return null;

			return (
				<div className="space-y-2 mb-4">
					{/* Global error display */}
					{hasGlobalError && (
						<ErrorDisplay
							showDetails={process.env.NODE_ENV === "development"}
							dismissible={true}
							showRetry={true}
							compact={false}
						/>
					)}

					{/* Local sync/persistence errors */}
					{hasLocalErrors && (
						<div className="bg-red-50 border border-red-200 rounded-md p-3">
							<div className="flex items-center justify-between">
								<div>
									<h4 className="text-sm font-medium text-red-800">
										Synchronization Issues
									</h4>
									{syncError && (
										<p className="text-sm text-red-700 mt-1">
											Server sync: {syncError}
										</p>
									)}
									{persistenceError && (
										<p className="text-sm text-red-700 mt-1">
											Local storage: {persistenceError}
										</p>
									)}
								</div>
								<div className="flex gap-2">
									{syncError && (
										<button
											onClick={() => resync()}
											className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded"
											disabled={isSyncing}
										>
											Retry Sync
										</button>
									)}
									{!isConnected && reconnect && (
										<button
											onClick={() => reconnect()}
											className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded"
											disabled={isSyncing}
										>
											Reconnect
										</button>
									)}
								</div>
							</div>
						</div>
					)}

					{/* Offline mode indicator */}
					{offlineMode.isOffline && (
						<div className="bg-blue-50 border border-blue-200 rounded-md p-3">
							<div className="flex items-center justify-between">
								<div>
									<h4 className="text-sm font-medium text-blue-800">
										Offline Mode
									</h4>
									<p className="text-sm text-blue-700">
										Working offline. Changes will sync when connection is
										restored.
									</p>
									{offlineMode.hasUnsyncedChanges && (
										<p className="text-xs text-blue-600 mt-1">
											{offlineMode.pendingOperations} pending changes
										</p>
									)}
								</div>
								{offlineMode.isOffline && offlineMode.hasUnsyncedChanges && (
									<button
										onClick={offlineMode.forceSync}
										disabled={offlineMode.isSyncing}
										className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded"
									>
										{offlineMode.isSyncing ? "Syncing..." : "Sync Now"}
									</button>
								)}
							</div>
						</div>
					)}
				</div>
			);
		},
	);

EnhancedErrorDisplay.displayName = "EnhancedErrorDisplay";

export default EnhancedErrorDisplay;
