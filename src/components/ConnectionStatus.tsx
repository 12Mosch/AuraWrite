import React from 'react';
import { ConnectionState } from '../hooks/useConnectionManager';

// CSS animation for indeterminate progress indicator
const progressAnimationStyles = `
  @keyframes indeterminateProgress {
    0% {
      transform: translateX(-100%);
    }
    50% {
      transform: translateX(150%);
    }
    100% {
      transform: translateX(-100%);
    }
  }
`;

/**
 * Props for the ConnectionStatus component
 */
interface ConnectionStatusProps {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether currently syncing */
  isSyncing?: boolean;
  /** Current error message */
  error?: string | null;
  /** Number of retry attempts */
  retryCount?: number;
  /** Time until next retry (in seconds) */
  nextRetryIn?: number;
  /** Function to force reconnection */
  onReconnect?: () => void;
  /** Component size */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show detailed status */
  showDetails?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * Connection status indicator component
 * 
 * Displays:
 * - Connection state with appropriate colors and icons
 * - Error messages
 * - Retry information
 * - Manual reconnection option
 */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connectionState,
  isSyncing = false,
  error,
  retryCount = 0,
  nextRetryIn = 0,
  onReconnect,
  size = 'md',
  showDetails = false,
  className = '',
}) => {
  const getStatusConfig = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          icon: <span aria-label="Connected status indicator">🟢</span>,
          label: isSyncing ? 'Syncing...' : 'Connected',
          description: 'Real-time sync active',
        };

      case ConnectionState.CONNECTING:
        return {
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          icon: <span aria-label="Connecting status indicator">🔵</span>,
          label: 'Connecting...',
          description: 'Establishing connection',
        };

      case ConnectionState.RECONNECTING:
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          icon: <span aria-label="Reconnecting status indicator">🟡</span>,
          label: `Reconnecting... (${retryCount})`,
          description: nextRetryIn > 0 ? `Next attempt in ${nextRetryIn}s` : 'Attempting to reconnect',
        };

      case ConnectionState.DISCONNECTED:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: <span aria-label="Disconnected status indicator">⚪</span>,
          label: 'Disconnected',
          description: 'Not connected to server',
        };

      case ConnectionState.FAILED:
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          icon: <span aria-label="Connection failed status indicator">🔴</span>,
          label: 'Connection Failed',
          description: error || 'Unable to connect after multiple attempts',
        };

      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: <span aria-label="Unknown connection status indicator">❓</span>,
          label: 'Unknown',
          description: 'Unknown connection state',
        };
    }
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-2',
    lg: 'text-base px-4 py-3',
  };

  const config = getStatusConfig();

  if (!showDetails) {
    // Compact view
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <span className="text-sm">{config.icon}</span>
        <span className={`${config.color} text-sm font-medium`}>
          {config.label}
        </span>
        {onReconnect && connectionState === ConnectionState.FAILED && (
          <button
            onClick={onReconnect}
            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Detailed view
  return (
    <>
      {/* Inject CSS animation styles */}
      <style>{progressAnimationStyles}</style>
      <div className={`${config.bgColor} rounded-lg border ${sizeClasses[size]} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-lg">{config.icon}</span>
          
          <div>
            <div className={`${config.color} font-medium`}>
              {config.label}
            </div>
            
            <div className="text-gray-600 text-sm">
              {config.description}
            </div>
            
            {error && connectionState === ConnectionState.FAILED && (
              <div className="text-red-600 text-xs mt-1 font-mono">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          {connectionState === ConnectionState.RECONNECTING && nextRetryIn > 0 && (
            <div className="text-xs text-gray-500 font-mono">
              {nextRetryIn}s
            </div>
          )}
          
          {onReconnect && (connectionState === ConnectionState.FAILED || connectionState === ConnectionState.DISCONNECTED) && (
            <button
              onClick={onReconnect}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded font-medium"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Indeterminate progress indicator for connecting/reconnecting */}
      {(connectionState === ConnectionState.CONNECTING || connectionState === ConnectionState.RECONNECTING) && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden">
            <div
              className="bg-blue-600 h-1 rounded-full animate-pulse"
              style={{
                width: '40%',
                animation: 'indeterminateProgress 2s ease-in-out infinite',
                transformOrigin: 'left center'
              }}
            />
          </div>
        </div>
      )}
    </div>
    </>
  );
};

/**
 * Simple connection indicator for status bars
 */
interface SimpleConnectionIndicatorProps {
  connectionState: ConnectionState;
  isSyncing?: boolean;
  className?: string;
}

export const SimpleConnectionIndicator: React.FC<SimpleConnectionIndicatorProps> = ({
  connectionState,
  isSyncing = false,
  className = '',
}) => {
  const getIndicator = () => {
    if (isSyncing) {
      return { icon: <span aria-label="Syncing status indicator">🔄</span>, color: 'text-blue-500', label: 'Syncing' };
    }

    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return { icon: <span aria-label="Connected status indicator">🟢</span>, color: 'text-green-500', label: 'Online' };
      case ConnectionState.CONNECTING:
        return { icon: <span aria-label="Connecting status indicator">🔵</span>, color: 'text-blue-500', label: 'Connecting' };
      case ConnectionState.RECONNECTING:
        return { icon: <span aria-label="Reconnecting status indicator">🟡</span>, color: 'text-yellow-500', label: 'Reconnecting' };
      case ConnectionState.DISCONNECTED:
        return { icon: <span aria-label="Disconnected status indicator">⚪</span>, color: 'text-gray-500', label: 'Offline' };
      case ConnectionState.FAILED:
        return { icon: <span aria-label="Connection failed status indicator">🔴</span>, color: 'text-red-500', label: 'Failed' };
      default:
        return { icon: <span aria-label="Unknown connection status indicator">❓</span>, color: 'text-gray-500', label: 'Unknown' };
    }
  };

  const indicator = getIndicator();

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <span className="text-sm">{indicator.icon}</span>
      <span className={`text-xs ${indicator.color} font-medium`}>
        {indicator.label}
      </span>
    </div>
  );
};

/**
 * Connection health badge
 */
interface ConnectionHealthBadgeProps {
  connectionState: ConnectionState;
  retryCount?: number;
  className?: string;
}

export const ConnectionHealthBadge: React.FC<ConnectionHealthBadgeProps> = ({
  connectionState,
  retryCount = 0,
  className = '',
}) => {
  const getBadgeConfig = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return {
          color: 'bg-green-500',
          label: 'Healthy',
          pulse: false,
        };
      
      case ConnectionState.CONNECTING:
      case ConnectionState.RECONNECTING:
        return {
          color: 'bg-yellow-500',
          label: retryCount > 0 ? `Retry ${retryCount}` : 'Connecting',
          pulse: true,
        };
      
      case ConnectionState.DISCONNECTED:
        return {
          color: 'bg-gray-500',
          label: 'Offline',
          pulse: false,
        };
      
      case ConnectionState.FAILED:
        return {
          color: 'bg-red-500',
          label: 'Failed',
          pulse: false,
        };
      
      default:
        return {
          color: 'bg-gray-500',
          label: 'Unknown',
          pulse: false,
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <div className={`inline-flex items-center ${className}`}>
      <div
        className={`w-2 h-2 rounded-full ${config.color} ${
          config.pulse ? 'animate-pulse' : ''
        } mr-2`}
      />
      <span className="text-xs font-medium text-gray-700">
        {config.label}
      </span>
    </div>
  );
};
