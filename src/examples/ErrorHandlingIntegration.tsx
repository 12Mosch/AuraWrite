/**
 * Comprehensive error handling integration example
 *
 * This example demonstrates how to integrate all error handling components
 * and hooks together in a real collaborative editor application.
 */

import { ConvexError } from "convex/values";
import React from "react";
import * as Y from "yjs";
import type { Id } from "../../convex/_generated/dataModel";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { ConvexCollaborativeEditor } from "../components/ConvexCollaborativeEditor";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
	ErrorDisplay,
	ErrorNotificationContainer,
} from "../components/ErrorDisplay";
import { ErrorProvider } from "../contexts/ErrorContext";
import { useConnectionManager } from "../hooks/useConnectionManager";
import { useConvexErrorHandler } from "../hooks/useConvexErrorHandler";
import { useOfflineMode } from "../hooks/useOfflineMode";

/**
 * Enhanced collaborative editor with comprehensive error handling
 */
const EnhancedCollaborativeEditor: React.FC<{
	documentId: Id<"documents">;
}> = ({ documentId }) => {
	// Connection management with error handling
	const connectionManager = useConnectionManager({
		maxRetries: 5,
		initialRetryDelay: 1000,
		healthCheckInterval: 30000,
	});

	// Set up connection test for the connection manager
	React.useEffect(() => {
		connectionManager.setConnectionTest(async () => {
			try {
				// Test connection by making a simple request
				const response = await fetch("/api/health", {
					method: "HEAD",
					cache: "no-cache",
				});
				return response.ok;
			} catch {
				return false;
			}
		});
	}, [connectionManager]);

	return (
		<div className="space-y-4">
			{/* Connection Status */}
			<ConnectionStatus
				connectionState={connectionManager.connectionState}
				isSyncing={false}
				error={connectionManager.error}
				retryCount={connectionManager.retryCount}
				nextRetryIn={connectionManager.nextRetryIn}
				onReconnect={connectionManager.reconnect}
				showDetails={true}
			/>

			{/* Error Display */}
			<ErrorDisplay
				showDetails={process.env.NODE_ENV === "development"}
				dismissible={true}
				showRetry={true}
			/>

			{/* Collaborative Editor */}
			<ConvexCollaborativeEditor
				documentId={documentId}
				enableSync={connectionManager.isConnected}
				useOptimizedSync={true}
				showPerformanceMonitor={process.env.NODE_ENV === "development"}
			/>
		</div>
	);
};

/**
 * Offline-aware collaborative editor
 */
const OfflineAwareEditor: React.FC<{
	documentId: Id<"documents">;
}> = ({ documentId }) => {
	const yDoc = React.useMemo(() => new Y.Doc(), []);

	const offlineMode = useOfflineMode({
		documentId,
		yDoc,
		enabled: true,
		autoResolveConflicts: true,
	});

	React.useEffect(() => {
		return () => {
			yDoc.destroy();
		};
	}, [yDoc]);

	return (
		<div className="space-y-4">
			{/* Offline Status */}
			{offlineMode.isOffline && (
				<div className="bg-blue-50 border border-blue-200 rounded-md p-3">
					<div className="flex items-center justify-between">
						<div>
							<h4 className="text-sm font-medium text-blue-800">
								Offline Mode
							</h4>
							<p className="text-sm text-blue-700">
								You're working offline. Changes will sync when you're back
								online.
							</p>
							{offlineMode.hasUnsyncedChanges && (
								<p className="text-xs text-blue-600 mt-1">
									{offlineMode.pendingOperations} pending changes
								</p>
							)}
						</div>

						{!offlineMode.isOffline && offlineMode.hasUnsyncedChanges && (
							<button
								type="button"
								onClick={offlineMode.forceSync}
								disabled={offlineMode.isSyncing}
								className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-sm"
							>
								{offlineMode.isSyncing ? "Syncing..." : "Sync Now"}
							</button>
						)}
					</div>
				</div>
			)}

			{/* Conflict Resolution */}
			{offlineMode.mode === "conflict" && (
				<div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
					<h4 className="text-sm font-medium text-yellow-800 mb-2">
						Sync Conflicts Detected
					</h4>
					<p className="text-sm text-yellow-700 mb-3">
						Your changes conflict with recent updates. Choose how to resolve:
					</p>

					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => offlineMode.resolveConflicts("local")}
							className="px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded text-sm"
						>
							Keep My Changes
						</button>
						<button
							type="button"
							onClick={() => offlineMode.resolveConflicts("remote")}
							className="px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded text-sm"
						>
							Use Server Version
						</button>
						<button
							type="button"
							onClick={() => offlineMode.resolveConflicts("merge")}
							className="px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded text-sm"
						>
							Merge Changes
						</button>
					</div>
				</div>
			)}

			<EnhancedCollaborativeEditor documentId={documentId} />
		</div>
	);
};

/**
 * Error handling demo component
 */
const ErrorHandlingDemo: React.FC = () => {
	const [documentId] = React.useState<Id<"documents">>(
		"demo-document" as Id<"documents">,
	);
	const { handleConvexError } = useConvexErrorHandler();

	// Demo error triggers
	const triggerNetworkError = () => {
		const error = new Error("Simulated network failure");
		error.name = "TypeError";
		handleConvexError(error, {
			operation: "mutation",
			functionName: "demoMutation",
		});
	};

	const triggerSyncConflict = () => {
		const error = new Error("Write conflict detected");
		handleConvexError(error, {
			operation: "mutation",
			functionName: "updateDocument",
		});
	};

	const triggerAuthError = () => {
		const error = new ConvexError({
			message: "Unauthorized access",
			code: "unauthorized",
		});
		handleConvexError(error, {
			operation: "query",
			functionName: "getPrivateDocument",
		});
	};

	return (
		<div className="max-w-4xl mx-auto p-6 space-y-6">
			<div className="bg-white rounded-lg shadow-sm border p-6">
				<h1 className="text-2xl font-bold mb-4">Error Handling Demo</h1>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
					<button
						type="button"
						onClick={triggerNetworkError}
						className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
					>
						Trigger Network Error
					</button>

					<button
						type="button"
						onClick={triggerSyncConflict}
						className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
					>
						Trigger Sync Conflict
					</button>

					<button
						type="button"
						onClick={triggerAuthError}
						className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
					>
						Trigger Auth Error
					</button>
				</div>

				<OfflineAwareEditor documentId={documentId} />
			</div>
		</div>
	);
};

/**
 * Complete error handling integration example
 */
export const ErrorHandlingIntegrationExample: React.FC = () => {
	return (
		<ErrorProvider
			maxHistorySize={20}
			onUnhandledError={(error) => {
				console.error("Unhandled error:", error);
				// Here you could send to error tracking service
			}}
		>
			<ErrorBoundary
				componentName="ErrorHandlingDemo"
				showErrorDetails={process.env.NODE_ENV === "development"}
				onError={(error) => {
					console.error("React error boundary caught:", error);
				}}
			>
				<ErrorHandlingDemo />

				{/* Global error notifications */}
				<ErrorNotificationContainer position="top-right" maxNotifications={3} />
			</ErrorBoundary>
		</ErrorProvider>
	);
};

/**
 * Usage example in your main App component:
 *
 * ```tsx
 * import { ErrorHandlingIntegrationExample } from './examples/ErrorHandlingIntegration';
 *
 * function App() {
 *   return (
 *     <div className="App">
 *       <ErrorHandlingIntegrationExample />
 *     </div>
 *   );
 * }
 * ```
 */
