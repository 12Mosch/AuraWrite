/**
 * React Error Boundary for catching and handling React component errors
 *
 * This component catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 */

import type React from "react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import {
	type AppError,
	ErrorCategory,
	ErrorSeverity,
	RecoveryStrategy,
} from "../types/errors";

/**
 * Error boundary state
 */
interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
	errorId: string | null;
}

/**
 * Error boundary props
 */
interface ErrorBoundaryProps {
	children: ReactNode;
	/** Custom fallback component */
	fallback?: (
		error: Error,
		errorInfo: ErrorInfo,
		retry: () => void,
	) => ReactNode;
	/** Error handler callback */
	onError?: (error: AppError) => void;
	/** Whether to show error details in development */
	showErrorDetails?: boolean;
	/** Component name for error context */
	componentName?: string;
}

/**
 * Default error fallback component
 */
const DefaultErrorFallback: React.FC<{
	error: Error;
	errorInfo: ErrorInfo;
	retry: () => void;
	showDetails?: boolean;
}> = ({ error, errorInfo, retry, showDetails = false }) => (
	<div className="min-h-[200px] flex items-center justify-center bg-red-50 border border-red-200 rounded-lg p-6">
		<div className="text-center max-w-md">
			<div className="text-red-600 text-4xl mb-4">⚠️</div>

			<h2 className="text-lg font-semibold text-red-800 mb-2">
				Something went wrong
			</h2>

			<p className="text-red-700 mb-4">
				An unexpected error occurred while rendering this component.
			</p>

			<div className="flex gap-2 justify-center">
				<button
					onClick={retry}
					className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
				>
					Try Again
				</button>

				<button
					onClick={() => window.location.reload()}
					className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
				>
					Reload Page
				</button>
			</div>

			{showDetails && (
				<details className="mt-4 text-left">
					<summary className="cursor-pointer text-red-600 font-medium">
						Error Details
					</summary>
					<div className="mt-2 p-3 bg-red-100 rounded text-sm font-mono text-red-800 overflow-auto max-h-40">
						<div className="mb-2">
							<strong>Error:</strong> {error.message}
						</div>
						<div className="mb-2">
							<strong>Stack:</strong>
							<pre className="whitespace-pre-wrap text-xs mt-1">
								{error.stack}
							</pre>
						</div>
						{errorInfo.componentStack && (
							<div>
								<strong>Component Stack:</strong>
								<pre className="whitespace-pre-wrap text-xs mt-1">
									{errorInfo.componentStack}
								</pre>
							</div>
						)}
					</div>
				</details>
			)}
		</div>
	</div>
);

/**
 * React Error Boundary component
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

	constructor(props: ErrorBoundaryProps) {
		super(props);

		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
			errorId: null,
		};
	}

	/**
	 * Static method to update state when an error is caught
	 */
	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return {
			hasError: true,
			error,
			errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
		};
	}

	/**
	 * Component did catch error lifecycle method
	 */
	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		this.setState({ errorInfo });

		// Log error to console
		console.error("ErrorBoundary caught an error:", error, errorInfo);

		// Create AppError for error context
		const appError: AppError = {
			code: "REACT_ERROR_BOUNDARY",
			message: `React component error: ${error.message}`,
			category: ErrorCategory.SYSTEM,
			severity: ErrorSeverity.HIGH,
			recoveryStrategy: RecoveryStrategy.RELOAD,
			timestamp: new Date(),
			retryable: true,
			maxRetries: 3,
			retryCount: 0,
			context: {
				componentName: this.props.componentName,
				errorStack: error.stack,
				componentStack: errorInfo.componentStack,
				errorId: this.state.errorId,
			},
		};

		// Call error handler if provided
		if (this.props.onError) {
			this.props.onError(appError);
		}

		// Report to error tracking service (if available)
		this.reportError(error, errorInfo);
	}

	/**
	 * Report error to external error tracking service
	 */
	private reportError = (error: Error, errorInfo: ErrorInfo) => {
		// This would integrate with services like Sentry, LogRocket, etc.
		try {
			// Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
			console.log("Error reported to tracking service:", {
				error: error.message,
				stack: error.stack,
				componentStack: errorInfo.componentStack,
				componentName: this.props.componentName,
				timestamp: new Date().toISOString(),
			});
		} catch (reportingError) {
			console.error("Failed to report error:", reportingError);
		}
	};

	/**
	 * Retry handler to reset error boundary
	 */
	private handleRetry = () => {
		// Clear any existing timeout
		if (this.retryTimeoutId) {
			clearTimeout(this.retryTimeoutId);
		}

		// Reset state after a short delay to allow for cleanup
		this.retryTimeoutId = window.setTimeout(() => {
			this.setState({
				hasError: false,
				error: null,
				errorInfo: null,
				errorId: null,
			});
		}, 100);
	};

	/**
	 * Component will unmount lifecycle method
	 */
	componentWillUnmount() {
		if (this.retryTimeoutId) {
			clearTimeout(this.retryTimeoutId);
		}
	}

	/**
	 * Render method
	 */
	render() {
		if (this.state.hasError && this.state.error && this.state.errorInfo) {
			// Custom fallback component
			if (this.props.fallback) {
				return this.props.fallback(
					this.state.error,
					this.state.errorInfo,
					this.handleRetry,
				);
			}

			// Default fallback component
			return (
				<DefaultErrorFallback
					error={this.state.error}
					errorInfo={this.state.errorInfo}
					retry={this.handleRetry}
					showDetails={
						this.props.showErrorDetails ??
						process.env.NODE_ENV === "development"
					}
				/>
			);
		}

		return this.props.children;
	}
}

/**
 * Higher-order component to wrap components with error boundary
 */
export function withErrorBoundary<P extends object>(
	Component: React.ComponentType<P>,
	errorBoundaryProps?: Omit<ErrorBoundaryProps, "children">,
) {
	const WrappedComponent = (props: P) => (
		<ErrorBoundary {...errorBoundaryProps}>
			<Component {...props} />
		</ErrorBoundary>
	);

	WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

	return WrappedComponent;
}

/**
 * Hook to trigger error boundary from within components
 */
export const useErrorBoundary = () => {
	return (error: Error) => {
		throw error;
	};
};
