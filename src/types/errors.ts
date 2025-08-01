/**
 * Comprehensive error types and interfaces for the AuraWrite collaborative editor
 *
 * This module defines all error types, error categories, and error handling interfaces
 * used throughout the application for consistent error management.
 */

import { ConvexError } from "convex/values";

/**
 * Base error categories for classification
 */
export enum ErrorCategory {
	NETWORK = "network",
	SYNC = "sync",
	PERSISTENCE = "persistence",
	AUTHENTICATION = "authentication",
	VALIDATION = "validation",
	CONFLICT = "conflict",
	SYSTEM = "system",
	USER = "user",
	RATE_LIMIT = "rate_limit",
	SERVER = "server",
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
	LOW = "low",
	MEDIUM = "medium",
	HIGH = "high",
	CRITICAL = "critical",
}

/**
 * Recovery strategies for different error types
 */
export enum RecoveryStrategy {
	RETRY = "retry",
	FALLBACK = "fallback",
	MANUAL = "manual",
	IGNORE = "ignore",
	RELOAD = "reload",
	REDIRECT = "redirect",
}

/**
 * Base error interface that all application errors should implement
 */
export interface BaseError {
	/** Unique error code for identification */
	code: string;
	/** Human-readable error message */
	message: string;
	/** Error category for classification */
	category: ErrorCategory;
	/** Error severity level */
	severity: ErrorSeverity;
	/** Suggested recovery strategy */
	recoveryStrategy: RecoveryStrategy;
	/** Additional context data */
	context?: Record<string, any>;
	/** Timestamp when error occurred */
	timestamp: Date;
	/** Whether this error can be retried */
	retryable: boolean;
	/** Maximum number of retry attempts */
	maxRetries?: number;
	/** Current retry count */
	retryCount?: number;
}

/**
 * Network-related error types
 */
export interface NetworkError extends BaseError {
	category: ErrorCategory.NETWORK;
	/** HTTP status code if applicable */
	statusCode?: number;
	/** Network timeout duration */
	timeout?: number;
	/** Whether the network is currently offline */
	isOffline: boolean;
}

/**
 * Synchronization error types
 */
export interface SyncError extends BaseError {
	category: ErrorCategory.SYNC;
	/** Document ID that failed to sync */
	documentId: string;
	/** Type of sync operation that failed */
	operation: "push" | "pull" | "merge";
	/** Conflicting changes if applicable */
	conflicts?: Array<{
		field: string;
		localValue: any;
		remoteValue: any;
	}>;
}

/**
 * Persistence error types
 */
export interface PersistenceError extends BaseError {
	category: ErrorCategory.PERSISTENCE;
	/** Storage type that failed */
	storageType: "indexeddb" | "localstorage" | "memory";
	/** Available storage quota */
	availableQuota?: number;
	/** Used storage quota */
	usedQuota?: number;
}

/**
 * Authentication error types
 */
export interface AuthenticationError extends BaseError {
	category: ErrorCategory.AUTHENTICATION;
	/** Authentication provider */
	provider?: string;
	/** Whether token is expired */
	tokenExpired?: boolean;
}

/**
 * Validation error types
 */
export interface ValidationError extends BaseError {
	category: ErrorCategory.VALIDATION;
	/** Field that failed validation */
	field?: string;
	/** Expected value or format */
	expected?: string;
	/** Actual value received */
	received?: string;
}

/**
 * Conflict resolution error types
 */
export interface ConflictError extends BaseError {
	category: ErrorCategory.CONFLICT;
	/** Type of conflict */
	conflictType: "write" | "version" | "schema" | "permission";
	/** Conflicting operations */
	operations: Array<{
		userId: string;
		timestamp: Date;
		operation: string;
	}>;
}

/**
 * Union type for all possible errors
 */
export type AppError =
	| NetworkError
	| SyncError
	| PersistenceError
	| AuthenticationError
	| ValidationError
	| ConflictError
	| BaseError;

/**
 * Error recovery action interface
 */
export interface ErrorRecoveryAction {
	/** Action label for UI */
	label: string;
	/** Action handler function */
	handler: () => void | Promise<void>;
	/** Whether action is destructive */
	destructive?: boolean;
	/** Whether action is primary */
	primary?: boolean;
}

/**
 * Error context for error boundaries and handlers
 */
export interface ErrorContext {
	/** Current error */
	error: AppError | null;
	/** Error history */
	errorHistory: AppError[];
	/** Available recovery actions */
	recoveryActions: ErrorRecoveryAction[];
	/** Clear current error */
	clearError: () => void;
	/** Add error to context */
	addError: (error: AppError) => void;
	/** Retry last failed operation */
	retry: () => Promise<void>;
	/** Whether currently retrying */
	isRetrying: boolean;
}

/**
 * Convex-specific error types
 */
export interface ConvexErrorData {
	/** Error message from Convex */
	message: string;
	/** Error code from Convex */
	code?: string;
	/** Additional error data */
	data?: Record<string, any>;
}

/**
 * Helper function to check if error is a ConvexError
 */
export function isConvexError(error: any): error is ConvexError {
	return error instanceof ConvexError;
}

/**
 * Helper function to extract error data from ConvexError
 */
export function extractConvexErrorData(error: ConvexError): ConvexErrorData {
	const data = error.data;

	if (typeof data === "string") {
		return { message: data };
	}

	if (typeof data === "object" && data !== null) {
		return {
			message: data.message || "Unknown Convex error",
			code: data.code,
			data: data,
		};
	}

	return { message: "Unknown Convex error" };
}

/**
 * Error factory functions for creating typed errors
 */
export const ErrorFactory = {
	network: (
		code: string,
		message: string,
		options: Partial<NetworkError> = {},
	): NetworkError => ({
		code,
		message,
		category: ErrorCategory.NETWORK,
		severity: ErrorSeverity.MEDIUM,
		recoveryStrategy: RecoveryStrategy.RETRY,
		timestamp: new Date(),
		retryable: true,
		maxRetries: 3,
		retryCount: 0,
		isOffline: !navigator.onLine,
		...options,
	}),

	sync: (
		code: string,
		message: string,
		documentId: string,
		operation: "push" | "pull" | "merge",
		options: Partial<SyncError> = {},
	): SyncError => ({
		code,
		message,
		category: ErrorCategory.SYNC,
		severity: ErrorSeverity.HIGH,
		recoveryStrategy: RecoveryStrategy.RETRY,
		timestamp: new Date(),
		retryable: true,
		maxRetries: 5,
		retryCount: 0,
		documentId,
		operation,
		...options,
	}),

	persistence: (
		code: string,
		message: string,
		storageType: "indexeddb" | "localstorage" | "memory",
		options: Partial<PersistenceError> = {},
	): PersistenceError => ({
		code,
		message,
		category: ErrorCategory.PERSISTENCE,
		severity: ErrorSeverity.MEDIUM,
		recoveryStrategy: RecoveryStrategy.FALLBACK,
		timestamp: new Date(),
		retryable: false,
		storageType,
		...options,
	}),

	authentication: (
		code: string,
		message: string,
		options: Partial<AuthenticationError> = {},
	): AuthenticationError => ({
		code,
		message,
		category: ErrorCategory.AUTHENTICATION,
		severity: ErrorSeverity.HIGH,
		recoveryStrategy: RecoveryStrategy.MANUAL,
		timestamp: new Date(),
		retryable: false,
		...options,
	}),

	validation: (
		code: string,
		message: string,
		field?: string,
		options: Partial<ValidationError> = {},
	): ValidationError => ({
		code,
		message,
		category: ErrorCategory.VALIDATION,
		severity: ErrorSeverity.LOW,
		recoveryStrategy: RecoveryStrategy.MANUAL,
		timestamp: new Date(),
		retryable: false,
		field,
		...options,
	}),

	conflict: (
		code: string,
		message: string,
		conflictType: "write" | "version" | "schema" | "permission",
		operations: ConflictError["operations"],
		options: Partial<ConflictError> = {},
	): ConflictError => ({
		code,
		message,
		category: ErrorCategory.CONFLICT,
		severity: ErrorSeverity.HIGH,
		recoveryStrategy: RecoveryStrategy.MANUAL,
		timestamp: new Date(),
		retryable: false,
		conflictType,
		operations,
		...options,
	}),
};
