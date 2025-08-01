/**
 * Error Context Provider for centralized error management
 *
 * This context provides a centralized way to manage errors throughout the application,
 * including error state, recovery actions, and retry logic.
 */

import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useReducer,
	useRef,
} from "react";
import {
	type AppError,
	ErrorCategory,
	type ErrorContext,
	type ErrorRecoveryAction,
	ErrorSeverity,
	RecoveryStrategy,
} from "../types/errors";

/**
 * Error state interface
 */
interface ErrorState {
	currentError: AppError | null;
	errorHistory: AppError[];
	isRetrying: boolean;
	retryCount: number;
}

/**
 * Error actions
 */
type ErrorAction =
	| { type: "SET_ERROR"; payload: AppError }
	| { type: "CLEAR_ERROR" }
	| { type: "START_RETRY" }
	| { type: "END_RETRY"; success: boolean }
	| { type: "CLEAR_HISTORY" };

/**
 * Error reducer
 */
function errorReducer(state: ErrorState, action: ErrorAction): ErrorState {
	const maxHistorySize = 10;

	switch (action.type) {
		case "SET_ERROR":
			return {
				...state,
				currentError: action.payload,
				errorHistory: [
					action.payload,
					...state.errorHistory.slice(0, maxHistorySize - 1),
				],
				retryCount: 0,
			};

		case "CLEAR_ERROR":
			return {
				...state,
				currentError: null,
				isRetrying: false,
				retryCount: 0,
			};

		case "START_RETRY":
			return {
				...state,
				isRetrying: true,
				retryCount: state.retryCount + 1,
			};

		case "END_RETRY":
			return {
				...state,
				isRetrying: false,
				currentError: action.success ? null : state.currentError,
			};

		case "CLEAR_HISTORY":
			return {
				...state,
				errorHistory: [],
			};

		default:
			return state;
	}
}

/**
 * Initial error state
 */
const initialState: ErrorState = {
	currentError: null,
	errorHistory: [],
	isRetrying: false,
	retryCount: 0,
};

/**
 * Error context
 */
const ErrorContextInstance = createContext<ErrorContext | null>(null);

/**
 * Error provider props
 */
interface ErrorProviderProps {
	children: React.ReactNode;
	/** Maximum number of errors to keep in history */
	maxHistorySize?: number;
	/** Global error handler for unhandled errors */
	onUnhandledError?: (error: AppError) => void;
}

/**
 * Error provider component
 */
export const ErrorProvider: React.FC<ErrorProviderProps> = ({
	children,
	onUnhandledError,
}) => {
	const [state, dispatch] = useReducer(errorReducer, initialState);
	const retryHandlerRef = useRef<(() => Promise<void>) | null>(null);
	const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	/**
	 * Cleanup timeout when component unmounts or error state changes
	 */
	useEffect(() => {
		return () => {
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}
		};
	}, [state.currentError]);

	/**
	 * Add error to context
	 */
	const addError = useCallback(
		(error: AppError) => {
			console.error("Error added to context:", error);

			// Call global error handler if provided
			if (onUnhandledError) {
				onUnhandledError(error);
			}

			dispatch({ type: "SET_ERROR", payload: error });

			// Auto-retry for retryable errors with low retry count
			if (
				error.retryable &&
				(error.retryCount || 0) < (error.maxRetries || 3)
			) {
				const retryDelay = Math.min(1000 * 2 ** (error.retryCount || 0), 10000); // Exponential backoff, max 10s

				// Clear any existing timeout before setting a new one
				if (retryTimeoutRef.current) {
					clearTimeout(retryTimeoutRef.current);
				}

				retryTimeoutRef.current = setTimeout(() => {
					if (retryHandlerRef.current) {
						retry();
					}
					retryTimeoutRef.current = null;
				}, retryDelay);
			}
		},
		[onUnhandledError],
	);

	/**
	 * Clear current error
	 */
	const clearError = useCallback(() => {
		// Clear any pending retry timeout
		if (retryTimeoutRef.current) {
			clearTimeout(retryTimeoutRef.current);
			retryTimeoutRef.current = null;
		}

		dispatch({ type: "CLEAR_ERROR" });
		retryHandlerRef.current = null;
	}, []);

	/**
	 * Retry last failed operation
	 */
	const retry = useCallback(async () => {
		if (!state.currentError || !retryHandlerRef.current) {
			return;
		}

		dispatch({ type: "START_RETRY" });

		try {
			await retryHandlerRef.current();
			dispatch({ type: "END_RETRY", success: true });
		} catch (error) {
			console.error("Retry failed:", error);

			// Update error with incremented retry count
			const updatedError: AppError = {
				...state.currentError,
				retryCount: (state.currentError.retryCount || 0) + 1,
			};

			dispatch({ type: "SET_ERROR", payload: updatedError });
			dispatch({ type: "END_RETRY", success: false });
		}
	}, [state.currentError]);

	/**
	 * Set retry handler for current error
	 */
	const setRetryHandler = useCallback((handler: () => Promise<void>) => {
		retryHandlerRef.current = handler;
	}, []);

	/**
	 * Generate recovery actions based on current error
	 */
	const getRecoveryActions = useCallback((): ErrorRecoveryAction[] => {
		if (!state.currentError) return [];

		const actions: ErrorRecoveryAction[] = [];

		// Add retry action for retryable errors
		if (state.currentError.retryable && !state.isRetrying) {
			const retryCount = state.currentError.retryCount || 0;
			const maxRetries = state.currentError.maxRetries || 3;

			if (retryCount < maxRetries) {
				actions.push({
					label: `Retry (${retryCount + 1}/${maxRetries})`,
					handler: retry,
					primary: true,
				});
			}
		}

		// Add dismiss action
		actions.push({
			label: "Dismiss",
			handler: clearError,
		});

		// Add specific actions based on error category
		switch (state.currentError.category) {
			case "network":
				actions.push({
					label: "Check Connection",
					handler: () => {
						// Open network settings or show network status
						console.log("Checking network connection...");
					},
				});
				break;

			case "persistence":
				actions.push({
					label: "Clear Storage",
					handler: () => {
						// Clear local storage
						localStorage.clear();
						clearError();
					},
					destructive: true,
				});
				break;

			case "authentication":
				actions.push({
					label: "Sign In Again",
					handler: () => {
						// Redirect to sign in
						window.location.href = "/auth/signin";
					},
					primary: true,
				});
				break;

			case "sync":
				actions.push({
					label: "Force Sync",
					handler: async () => {
						// Implement force sync logic
						console.log("Force syncing...");
						clearError();
					},
				});
				break;
		}

		return actions;
	}, [state.currentError, state.isRetrying, retry, clearError]);

	/**
	 * Context value
	 */
	const contextValue: ErrorContext = {
		error: state.currentError,
		errorHistory: state.errorHistory,
		recoveryActions: getRecoveryActions(),
		clearError,
		addError,
		retry,
		isRetrying: state.isRetrying,
	};

	return (
		<ErrorContextInstance.Provider value={contextValue}>
			{children}
		</ErrorContextInstance.Provider>
	);
};

/**
 * Hook to use error context
 */
export const useError = (): ErrorContext => {
	const context = useContext(ErrorContextInstance);
	if (!context) {
		throw new Error("useError must be used within an ErrorProvider");
	}
	return context;
};

/**
 * Hook to handle errors with automatic context integration
 */
export const useErrorHandler = () => {
	const { addError } = useError();

	return useCallback(
		(error: Error | AppError | unknown, context?: Record<string, any>) => {
			let appError: AppError;

			if (error && typeof error === "object" && "category" in error) {
				// Already an AppError
				appError = error as AppError;
			} else if (error instanceof Error) {
				// Convert Error to AppError
				appError = {
					code: "UNKNOWN_ERROR",
					message: error.message,
					category: ErrorCategory.SYSTEM,
					severity: ErrorSeverity.MEDIUM,
					recoveryStrategy: RecoveryStrategy.RETRY,
					timestamp: new Date(),
					retryable: false,
					context,
				};
			} else {
				// Unknown error type
				appError = {
					code: "UNKNOWN_ERROR",
					message: String(error) || "An unknown error occurred",
					category: ErrorCategory.SYSTEM,
					severity: ErrorSeverity.MEDIUM,
					recoveryStrategy: RecoveryStrategy.RETRY,
					timestamp: new Date(),
					retryable: false,
					context,
				};
			}

			addError(appError);
		},
		[addError],
	);
};
