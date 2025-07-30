/**
 * Comprehensive error display component
 * 
 * This component provides user-friendly error messages with actionable
 * recovery options, retry buttons, and contextual help.
 */

import React, { useState } from 'react';
import { AppError, ErrorSeverity, ErrorCategory, RecoveryStrategy } from '../types/errors';
import { useError } from '../contexts/ErrorContext';

/**
 * Error display props
 */
interface ErrorDisplayProps {
  /** Error to display (optional, uses context if not provided) */
  error?: AppError | null;
  /** Whether to show error details */
  showDetails?: boolean;
  /** Custom CSS classes */
  className?: string;
  /** Whether to show dismiss button */
  dismissible?: boolean;
  /** Whether to show retry button */
  showRetry?: boolean;
  /** Custom recovery actions */
  customActions?: Array<{
    label: string;
    handler: () => void;
    variant?: 'primary' | 'secondary' | 'destructive';
  }>;
  /** Compact mode for smaller displays */
  compact?: boolean;
}

/**
 * Error icon mapping
 */
const ERROR_ICONS = {
  [ErrorSeverity.LOW]: '⚠️',
  [ErrorSeverity.MEDIUM]: '⚠️',
  [ErrorSeverity.HIGH]: '❌',
  [ErrorSeverity.CRITICAL]: '🚨',
};

/**
 * Error color mapping
 */
const ERROR_COLORS = {
  [ErrorSeverity.LOW]: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    button: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800',
  },
  [ErrorSeverity.MEDIUM]: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    button: 'bg-orange-100 hover:bg-orange-200 text-orange-800',
  },
  [ErrorSeverity.HIGH]: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    button: 'bg-red-100 hover:bg-red-200 text-red-800',
  },
  [ErrorSeverity.CRITICAL]: {
    bg: 'bg-red-100',
    border: 'border-red-300',
    text: 'text-red-900',
    button: 'bg-red-200 hover:bg-red-300 text-red-900',
  },
};

/**
 * Error display component
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error: propError,
  showDetails = false,
  className = '',
  dismissible = true,
  showRetry = true,
  customActions = [],
  compact = false,
}) => {
  const { error: contextError, recoveryActions, clearError, retry, isRetrying } = useError();
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const error = propError || contextError;

  if (!error) return null;

  const colors = ERROR_COLORS[error.severity];
  const icon = ERROR_ICONS[error.severity];

  /**
   * Get user-friendly error message
   */
  const getUserFriendlyMessage = (error: AppError): string => {
    switch (error.category) {
      case ErrorCategory.NETWORK:
        if (error.context?.isOffline) {
          return 'You appear to be offline. Please check your internet connection and try again.';
        }
        return 'Network connection issue. Please check your internet connection.';

      case ErrorCategory.SYNC:
        return 'There was a problem syncing your changes. Your work is saved locally and will sync when the connection is restored.';

      case ErrorCategory.PERSISTENCE:
        return 'Unable to save changes locally. Please check your browser storage settings.';

      case ErrorCategory.AUTHENTICATION:
        return 'Authentication required. Please sign in to continue.';

      case ErrorCategory.VALIDATION:
        return 'Please check your input and try again.';

      case ErrorCategory.CONFLICT:
        return 'Your changes conflict with recent updates. Please review and resolve the conflicts.';

      default:
        return error.message;
    }
  };

  /**
   * Get contextual help text
   */
  const getHelpText = (error: AppError): string | null => {
    switch (error.category) {
      case ErrorCategory.NETWORK:
        return 'Try refreshing the page or checking your internet connection. Your work is saved locally.';

      case ErrorCategory.SYNC:
        return 'Your changes are saved locally and will automatically sync when the connection is restored.';

      case ErrorCategory.PERSISTENCE:
        return 'Check if your browser storage is full or if you\'re in private browsing mode.';

      case ErrorCategory.AUTHENTICATION:
        return 'You may need to sign in again or check your account permissions.';

      case ErrorCategory.CONFLICT:
        return 'This happens when multiple people edit the same content simultaneously.';

      default:
        return null;
    }
  };

  const userMessage = getUserFriendlyMessage(error);
  const helpText = getHelpText(error);

  // Combine context and custom actions
  const allActions = [...recoveryActions, ...customActions.map(action => ({
    label: action.label,
    handler: action.handler,
    primary: action.variant === 'primary',
    destructive: action.variant === 'destructive',
  }))];

  if (compact) {
    return (
      <div className={`${colors.bg} ${colors.border} border rounded-md p-2 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm">{icon}</span>
            <span className={`${colors.text} text-sm font-medium`}>
              {userMessage}
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            {showRetry && error.retryable && (
              <button
                onClick={retry}
                disabled={isRetrying}
                className={`${colors.button} px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50`}
              >
                {isRetrying ? '...' : 'Retry'}
              </button>
            )}
            
            {dismissible && (
              <button
                onClick={clearError}
                className={`${colors.text} hover:opacity-75 text-sm`}
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg p-4 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <span className="text-2xl">{icon}</span>
          
          <div className="flex-1">
            <h3 className={`${colors.text} font-semibold text-lg mb-1`}>
              {error.severity === ErrorSeverity.CRITICAL ? 'Critical Error' :
               error.severity === ErrorSeverity.HIGH ? 'Error' :
               'Warning'}
            </h3>
            
            <p className={`${colors.text} mb-2`}>
              {userMessage}
            </p>
            
            {helpText && (
              <p className={`${colors.text} text-sm opacity-75 mb-3`}>
                {helpText}
              </p>
            )}

            {/* Error details */}
            {showDetails && (
              <div className="mt-3">
                <button
                  onClick={() => setDetailsExpanded(!detailsExpanded)}
                  className={`${colors.text} text-sm underline hover:no-underline`}
                >
                  {detailsExpanded ? 'Hide' : 'Show'} technical details
                </button>
                
                {detailsExpanded && (
                  <div className="mt-2 p-3 bg-white bg-opacity-50 rounded border text-xs font-mono">
                    <div className="mb-2">
                      <strong>Error Code:</strong> {error.code}
                    </div>
                    <div className="mb-2">
                      <strong>Category:</strong> {error.category}
                    </div>
                    <div className="mb-2">
                      <strong>Timestamp:</strong> {error.timestamp.toISOString()}
                    </div>
                    {error.context && (
                      <div>
                        <strong>Context:</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {JSON.stringify(error.context, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {dismissible && (
          <button
            onClick={clearError}
            className={`${colors.text} hover:opacity-75 text-xl leading-none ml-2`}
          >
            ×
          </button>
        )}
      </div>

      {/* Action buttons */}
      {allActions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {allActions.map((action, index) => (
            <button
              key={index}
              onClick={action.handler}
              disabled={isRetrying && action.label.toLowerCase().includes('retry')}
              className={`
                px-3 py-2 rounded font-medium text-sm transition-colors
                ${action.primary 
                  ? `${colors.text} bg-white border border-current hover:bg-opacity-90`
                  : action.destructive
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : `${colors.button}`
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isRetrying && action.label.toLowerCase().includes('retry') ? 'Retrying...' : action.label}
            </button>
          ))}
        </div>
      )}

      {/* Retry progress indicator */}
      {error.retryable && error.retryCount !== undefined && error.maxRetries && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className={colors.text}>
              Retry {error.retryCount} of {error.maxRetries}
            </span>
            <span className={colors.text}>
              {error.retryCount >= error.maxRetries ? 'Max retries reached' : 'Auto-retry enabled'}
            </span>
          </div>
          
          <div className="mt-1 w-full bg-white bg-opacity-50 rounded-full h-1">
            <div
              className={`h-1 rounded-full transition-all duration-300 ${
                error.retryCount >= error.maxRetries ? 'bg-red-400' : 'bg-blue-400'
              }`}
              style={{
                width: `${Math.min((error.retryCount / error.maxRetries) * 100, 100)}%`
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Error toast component for non-intrusive notifications
 */
export const ErrorToast: React.FC<{
  error: AppError;
  onDismiss: () => void;
  autoHide?: boolean;
  hideDelay?: number;
}> = ({ error, onDismiss, autoHide = true, hideDelay = 5000 }) => {
  React.useEffect(() => {
    if (autoHide && error.severity !== ErrorSeverity.CRITICAL) {
      const timer = setTimeout(onDismiss, hideDelay);
      return () => clearTimeout(timer);
    }
  }, [autoHide, hideDelay, onDismiss, error.severity]);

  const colors = ERROR_COLORS[error.severity];
  const icon = ERROR_ICONS[error.severity];

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg shadow-lg p-3 max-w-sm`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span>{icon}</span>
          <span className={`${colors.text} font-medium text-sm`}>
            {error.message}
          </span>
        </div>

        <button
          onClick={onDismiss}
          className={`${colors.text} hover:opacity-75 ml-2`}
        >
          ×
        </button>
      </div>
    </div>
  );
};

/**
 * Error notification container for managing multiple toasts
 */
export const ErrorNotificationContainer: React.FC<{
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  maxNotifications?: number;
}> = ({ position = 'top-right', maxNotifications = 5 }) => {
  const { errorHistory, clearError } = useError();
  const [visibleErrors, setVisibleErrors] = useState<AppError[]>([]);

  // Update visible errors when error history changes
  React.useEffect(() => {
    const recentErrors = errorHistory
      .slice(0, maxNotifications)
      .filter(error => error.severity !== ErrorSeverity.LOW); // Only show medium+ severity

    setVisibleErrors(recentErrors);
  }, [errorHistory, maxNotifications]);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  if (visibleErrors.length === 0) return null;

  return (
    <div className={`fixed ${positionClasses[position]} z-50 space-y-2`}>
      {visibleErrors.map((error, index) => (
        <ErrorToast
          key={`${error.code}-${error.timestamp.getTime()}`}
          error={error}
          onDismiss={() => {
            setVisibleErrors(prev => prev.filter((_, i) => i !== index));
          }}
        />
      ))}
    </div>
  );
};
