/**
 * Convex-specific error handling hook
 * 
 * This hook provides utilities for handling Convex-specific errors including
 * ConvexError instances, network failures, and mutation/query/action errors.
 */

import { useCallback } from 'react';
import { ConvexError } from 'convex/values';
import { 
  AppError, 
  ErrorFactory, 
  ErrorSeverity, 
  isConvexError, 
  extractConvexErrorData,
  ErrorCategory,
  RecoveryStrategy
} from '../types/errors';
import { useErrorHandler } from '../contexts/ErrorContext';

/**
 * Convex operation types
 */
export type ConvexOperationType = 'query' | 'mutation' | 'action';

/**
 * Convex error context
 */
interface ConvexErrorContext {
  operation: ConvexOperationType;
  functionName: string;
  args?: Record<string, any>;
  retryCount?: number;
}

/**
 * Hook for handling Convex-specific errors
 */
export const useConvexErrorHandler = () => {
  const handleError = useErrorHandler();

  /**
   * Handle Convex errors with proper categorization and recovery strategies
   */
  const handleConvexError = useCallback((
    error: unknown,
    context: ConvexErrorContext
  ): AppError => {
    let appError: AppError;

    if (isConvexError(error)) {
      // Handle ConvexError instances
      const convexData = extractConvexErrorData(error);
      appError = createConvexAppError(convexData, context);
    } else if (error instanceof Error) {
      // Handle regular JavaScript errors
      appError = createNetworkAppError(error, context);
    } else {
      // Handle unknown error types
      appError = createUnknownAppError(error, context);
    }

    // Add to error context
    handleError(appError);
    
    return appError;
  }, [handleError]);

  /**
   * Wrapper for Convex mutations with error handling
   */
  const withMutationErrorHandling = useCallback(<T extends any[], R>(
    mutationFn: (...args: T) => Promise<R>,
    functionName: string
  ) => {
    return async (...args: T): Promise<R> => {
      try {
        return await mutationFn(...args);
      } catch (error) {
        const appError = handleConvexError(error, {
          operation: 'mutation',
          functionName,
          args: args.length > 0 ? { args } : undefined,
        });
        throw appError;
      }
    };
  }, [handleConvexError]);

  /**
   * Wrapper for Convex queries with error handling
   */
  const withQueryErrorHandling = useCallback(<T extends any[], R>(
    queryFn: (...args: T) => R,
    functionName: string
  ) => {
    return (...args: T): R => {
      try {
        return queryFn(...args);
      } catch (error) {
        const appError = handleConvexError(error, {
          operation: 'query',
          functionName,
          args: args.length > 0 ? { args } : undefined,
        });
        throw appError;
      }
    };
  }, [handleConvexError]);

  /**
   * Wrapper for Convex actions with error handling
   */
  const withActionErrorHandling = useCallback(<T extends any[], R>(
    actionFn: (...args: T) => Promise<R>,
    functionName: string
  ) => {
    return async (...args: T): Promise<R> => {
      try {
        return await actionFn(...args);
      } catch (error) {
        const appError = handleConvexError(error, {
          operation: 'action',
          functionName,
          args: args.length > 0 ? { args } : undefined,
        });
        throw appError;
      }
    };
  }, [handleConvexError]);

  return {
    handleConvexError,
    withMutationErrorHandling,
    withQueryErrorHandling,
    withActionErrorHandling,
  };
};

/**
 * Create AppError from ConvexError
 */
function createConvexAppError(
  convexData: ReturnType<typeof extractConvexErrorData>,
  context: ConvexErrorContext
): AppError {
  // Determine error category based on error message/code
  let category = ErrorCategory.SYSTEM;
  let severity = ErrorSeverity.MEDIUM;
  let recoveryStrategy = RecoveryStrategy.RETRY;
  let retryable = true;

  const message = convexData.message.toLowerCase();
  const code = convexData.code?.toLowerCase();

  // Categorize based on error content
  if (message.includes('unauthorized') || message.includes('permission') || code === 'unauthorized') {
    category = ErrorCategory.AUTHENTICATION;
    severity = ErrorSeverity.HIGH;
    recoveryStrategy = RecoveryStrategy.MANUAL;
    retryable = false;
  } else if (message.includes('validation') || message.includes('invalid') || code === 'validation_error') {
    category = ErrorCategory.VALIDATION;
    severity = ErrorSeverity.LOW;
    recoveryStrategy = RecoveryStrategy.MANUAL;
    retryable = false;
  } else if (message.includes('conflict') || message.includes('write conflict') || code === 'write_conflict') {
    category = ErrorCategory.CONFLICT;
    severity = ErrorSeverity.HIGH;
    recoveryStrategy = RecoveryStrategy.RETRY;
    retryable = true;
  } else if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    category = ErrorCategory.NETWORK;
    severity = ErrorSeverity.MEDIUM;
    recoveryStrategy = RecoveryStrategy.RETRY;
    retryable = true;
  }

  return {
    code: `CONVEX_${context.operation.toUpperCase()}_ERROR`,
    message: `${context.operation} "${context.functionName}" failed: ${convexData.message}`,
    category,
    severity,
    recoveryStrategy,
    timestamp: new Date(),
    retryable,
    maxRetries: retryable ? (category === ErrorCategory.CONFLICT ? 5 : 3) : 0,
    retryCount: context.retryCount || 0,
    context: {
      operation: context.operation,
      functionName: context.functionName,
      args: context.args,
      convexErrorData: convexData,
    },
  };
}

/**
 * Create AppError from network/JavaScript error
 */
function createNetworkAppError(
  error: Error,
  context: ConvexErrorContext
): AppError {
  let category = ErrorCategory.NETWORK;
  let severity = ErrorSeverity.MEDIUM;
  let retryable = true;

  // Check for specific error types
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    category = ErrorCategory.NETWORK;
    severity = ErrorSeverity.HIGH;
  } else if (error.name === 'AbortError') {
    category = ErrorCategory.NETWORK;
    severity = ErrorSeverity.LOW;
  } else if (error.message.includes('timeout')) {
    category = ErrorCategory.NETWORK;
    severity = ErrorSeverity.MEDIUM;
  }

  return ErrorFactory.network(
    `CONVEX_${context.operation.toUpperCase()}_NETWORK_ERROR`,
    `${context.operation} "${context.functionName}" network error: ${error.message}`,
    {
      category,
      severity,
      retryable,
      maxRetries: 3,
      retryCount: context.retryCount || 0,
      isOffline: !navigator.onLine,
      context: {
        operation: context.operation,
        functionName: context.functionName,
        args: context.args,
        originalError: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
    }
  );
}

/**
 * Create AppError from unknown error
 */
function createUnknownAppError(
  error: unknown,
  context: ConvexErrorContext
): AppError {
  return {
    code: `CONVEX_${context.operation.toUpperCase()}_UNKNOWN_ERROR`,
    message: `${context.operation} "${context.functionName}" unknown error: ${String(error)}`,
    category: ErrorCategory.SYSTEM,
    severity: ErrorSeverity.MEDIUM,
    recoveryStrategy: RecoveryStrategy.RETRY,
    timestamp: new Date(),
    retryable: true,
    maxRetries: 2,
    retryCount: context.retryCount || 0,
    context: {
      operation: context.operation,
      functionName: context.functionName,
      args: context.args,
      unknownError: error,
    },
  };
}

/**
 * Utility hook for handling specific Convex error patterns
 */
export const useConvexErrorPatterns = () => {
  const { handleConvexError } = useConvexErrorHandler();

  /**
   * Handle write conflict errors with automatic retry
   */
  const handleWriteConflict = useCallback(async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 5
  ): Promise<T> => {
    let lastError: unknown;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if it's a write conflict
        if (isConvexError(error)) {
          const data = extractConvexErrorData(error);
          if (data.message.toLowerCase().includes('write conflict')) {
            // Exponential backoff with jitter
            const delay = Math.min(100 * Math.pow(2, attempt) + Math.random() * 100, 2000);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // Not a write conflict, don't retry
        break;
      }
    }
    
    // All retries failed
    throw lastError;
  }, []);

  /**
   * Handle rate limit errors with backoff
   */
  const handleRateLimit = useCallback(async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> => {
    let lastError: unknown;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error
        if (isConvexError(error)) {
          const data = extractConvexErrorData(error);
          if (data.message.toLowerCase().includes('rate limit') || 
              data.code?.toLowerCase() === 'rate_limit_exceeded') {
            // Wait longer for rate limits
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // Not a rate limit error, don't retry
        break;
      }
    }
    
    // All retries failed
    throw lastError;
  }, []);

  return {
    handleWriteConflict,
    handleRateLimit,
  };
};
