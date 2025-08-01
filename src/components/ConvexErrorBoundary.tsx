/**
 * Specialized Error Boundary for Convex query errors
 *
 * This component extends the base ErrorBoundary to provide specific handling
 * for Convex-related errors, including ConvexError, server errors, and network issues.
 *
 * According to Convex documentation, the recommended way to handle query errors
 * is using React Error Boundaries, as errors are thrown directly from useQuery hooks.
 */

import type React from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
	type AppError,
	ErrorCategory,
	ErrorSeverity,
	RecoveryStrategy,
} from "../types/errors";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Props for ConvexErrorBoundary
 */
interface ConvexErrorBoundaryProps {
	children: ReactNode;
	/** Custom fallback component for Convex errors */
	fallback?: (
		error: Error,
		errorInfo: ErrorInfo,
		retry: () => void,
	) => ReactNode;
	/** Error handler callback */
	onError?: (error: AppError) => void;
	/** Component name for error context */
	componentName?: string;
	/** Whether to show detailed error information in development */
	showErrorDetails?: boolean;
}

/**
 * Check if an error is Convex-related
 */
const isConvexError = (error: Error): boolean => {
	const errorMessage = error.message.toLowerCase();
	const errorStack = error.stack?.toLowerCase() || "";

	return (
		errorMessage.includes("convexerror") ||
		errorMessage.includes("server error") ||
		errorMessage.includes("convex") ||
		errorStack.includes("convex") ||
		errorStack.includes("usequery") ||
		// Check for common Convex error patterns
		errorMessage.includes("function not found") ||
		errorMessage.includes("invalid arguments") ||
		errorMessage.includes("unauthorized") ||
		errorMessage.includes("rate limit") ||
		errorMessage.includes("read/write limit")
	);
};

/**
 * Categorize Convex errors for better handling
 */
const categorizeConvexError = (
	error: Error,
): {
	category: ErrorCategory;
	severity: ErrorSeverity;
	recoveryStrategy: RecoveryStrategy;
	retryable: boolean;
} => {
	const errorMessage = error.message.toLowerCase();

	// Network/connectivity errors
	if (errorMessage.includes("network") || errorMessage.includes("connection")) {
		return {
			category: ErrorCategory.NETWORK,
			severity: ErrorSeverity.MEDIUM,
			recoveryStrategy: RecoveryStrategy.RETRY,
			retryable: true,
		};
	}

	// Authentication errors
	if (
		errorMessage.includes("unauthorized") ||
		errorMessage.includes("authentication")
	) {
		return {
			category: ErrorCategory.AUTHENTICATION,
			severity: ErrorSeverity.HIGH,
			recoveryStrategy: RecoveryStrategy.REDIRECT,
			retryable: false,
		};
	}

	// Rate limiting errors
	if (
		errorMessage.includes("rate limit") ||
		errorMessage.includes("too many requests")
	) {
		return {
			category: ErrorCategory.RATE_LIMIT,
			severity: ErrorSeverity.MEDIUM,
			recoveryStrategy: RecoveryStrategy.RETRY,
			retryable: true,
		};
	}

	// Read/write limit errors
	if (
		errorMessage.includes("read/write limit") ||
		errorMessage.includes("too much data")
	) {
		return {
			category: ErrorCategory.VALIDATION,
			severity: ErrorSeverity.HIGH,
			recoveryStrategy: RecoveryStrategy.MANUAL,
			retryable: false,
		};
	}

	// Function not found or invalid arguments
	if (
		errorMessage.includes("function not found") ||
		errorMessage.includes("invalid arguments")
	) {
		return {
			category: ErrorCategory.VALIDATION,
			severity: ErrorSeverity.HIGH,
			recoveryStrategy: RecoveryStrategy.MANUAL,
			retryable: false,
		};
	}

	// Generic server errors
	if (errorMessage.includes("server error")) {
		return {
			category: ErrorCategory.SERVER,
			severity: ErrorSeverity.HIGH,
			recoveryStrategy: RecoveryStrategy.RETRY,
			retryable: true,
		};
	}

	// Default for unknown Convex errors
	return {
		category: ErrorCategory.SYSTEM,
		severity: ErrorSeverity.MEDIUM,
		recoveryStrategy: RecoveryStrategy.RETRY,
		retryable: true,
	};
};

/**
 * Default fallback component for Convex errors
 */
const ConvexErrorFallback: React.FC<{
	error: Error;
	errorInfo: ErrorInfo;
	retry: () => void;
	showDetails?: boolean;
}> = ({ error, errorInfo: _, retry, showDetails = false }) => {
	const errorCategory = categorizeConvexError(error);

	const getErrorTitle = () => {
		switch (errorCategory.category) {
			case ErrorCategory.NETWORK:
				return "Connection Problem";
			case ErrorCategory.AUTHENTICATION:
				return "Authentication Required";
			case ErrorCategory.RATE_LIMIT:
				return "Too Many Requests";
			case ErrorCategory.VALIDATION:
				return "Data Error";
			case ErrorCategory.SERVER:
				return "Server Error";
			default:
				return "Unable to Load Data";
		}
	};

	const getErrorMessage = () => {
		switch (errorCategory.category) {
			case ErrorCategory.NETWORK:
				return "There seems to be a connection issue. Please check your internet connection and try again.";
			case ErrorCategory.AUTHENTICATION:
				return "You need to be signed in to access this information.";
			case ErrorCategory.RATE_LIMIT:
				return "Too many requests have been made. Please wait a moment and try again.";
			case ErrorCategory.VALIDATION:
				return "There was a problem with the data request. Please try refreshing the page.";
			case ErrorCategory.SERVER:
				return "The server encountered an error. Please try again in a few moments.";
			default:
				return "We encountered an issue loading your data. Please try again.";
		}
	};

	return (
		<div className="min-h-[200px] flex items-center justify-center bg-blue-50 border border-blue-200 rounded-lg p-6">
			<div className="text-center max-w-md">
				<div className="text-blue-600 text-4xl mb-4">📡</div>

				<h2 className="text-lg font-semibold text-blue-800 mb-2">
					{getErrorTitle()}
				</h2>

				<p className="text-blue-700 mb-4">{getErrorMessage()}</p>

				<div className="flex gap-2 justify-center">
					{errorCategory.retryable && (
						<button
							type="button"
							onClick={retry}
							className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
						>
							Try Again
						</button>
					)}

					<button
						type="button"
						onClick={() => window.location.reload()}
						className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
					>
						Refresh Page
					</button>
				</div>

				{showDetails && (
					<details className="mt-4 text-left">
						<summary className="cursor-pointer text-blue-600 font-medium">
							Technical Details
						</summary>
						<div className="mt-2 p-3 bg-blue-100 rounded text-sm font-mono text-blue-800 overflow-auto max-h-40">
							<div className="mb-2">
								<strong>Error:</strong> {error.message}
							</div>
							<div className="mb-2">
								<strong>Category:</strong> {errorCategory.category}
							</div>
							<div className="mb-2">
								<strong>Retryable:</strong>{" "}
								{errorCategory.retryable ? "Yes" : "No"}
							</div>
							{error.stack && (
								<div>
									<strong>Stack:</strong>
									<pre className="whitespace-pre-wrap text-xs mt-1">
										{error.stack}
									</pre>
								</div>
							)}
						</div>
					</details>
				)}
			</div>
		</div>
	);
};

/**
 * Specialized Error Boundary for Convex queries
 */
export const ConvexErrorBoundary: React.FC<ConvexErrorBoundaryProps> = ({
	children,
	fallback,
	onError,
	componentName,
	showErrorDetails,
}) => {
	const handleError = (error: AppError) => {
		// Log Convex-specific error information
		if (isConvexError(error)) {
			console.error("Convex query error detected:", {
				message: error.message,
				category: error.category,
				severity: error.severity,
				context: error.context,
			});
		}

		// Call the provided error handler
		onError?.(error);
	};

	const convexFallback =
		fallback ||
		((error: Error, errorInfo: ErrorInfo, retry: () => void) => (
			<ConvexErrorFallback
				error={error}
				errorInfo={errorInfo}
				retry={retry}
				showDetails={showErrorDetails}
			/>
		));

	return (
		<ErrorBoundary
			fallback={(error: Error, errorInfo: ErrorInfo, retry: () => void) => {
				// Only use Convex fallback for Convex errors
				if (isConvexError(error)) {
					return convexFallback(error, errorInfo, retry);
				}
				// Use default fallback for non-Convex errors
				return null; // This will use the default ErrorBoundary fallback
			}}
			onError={handleError}
			componentName={componentName}
			showErrorDetails={showErrorDetails}
		>
			{children}
		</ErrorBoundary>
	);
};

/**
 * Higher-order component to wrap components with Convex error boundary
 */
export function withConvexErrorBoundary<P extends object>(
	Component: React.ComponentType<P>,
	errorBoundaryProps?: Omit<ConvexErrorBoundaryProps, "children">,
) {
	const WrappedComponent = (props: P) => (
		<ConvexErrorBoundary {...errorBoundaryProps}>
			<Component {...props} />
		</ConvexErrorBoundary>
	);

	WrappedComponent.displayName = `withConvexErrorBoundary(${Component.displayName || Component.name})`;

	return WrappedComponent;
}
