import { useState, useEffect, useRef, useCallback } from 'react';
import { useNetworkStatus } from './useNetworkStatus';

/**
 * Connection state enum
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * Connection manager options
 */
export interface ConnectionManagerOptions {
  /** Whether connection management is enabled */
  enabled?: boolean;
  /** Initial retry delay in milliseconds */
  initialRetryDelay?: number;
  /** Maximum retry delay in milliseconds */
  maxRetryDelay?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Backoff multiplier for retry delays */
  backoffMultiplier?: number;
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
}

/**
 * Connection manager return type
 */
export interface ConnectionManagerReturn {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether currently connected */
  isConnected: boolean;
  /** Whether currently reconnecting */
  isReconnecting: boolean;
  /** Current error message, if any */
  error: string | null;
  /** Number of retry attempts made */
  retryCount: number;
  /** Time until next retry attempt (in seconds) */
  nextRetryIn: number;
  /** Force a reconnection attempt */
  reconnect: () => void;
  /** Reset the connection manager */
  reset: () => void;
  /** Register a connection test function */
  setConnectionTest: (test: () => Promise<boolean>) => void;
}

/**
 * Enhanced connection manager hook with automatic reconnection
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Network status awareness
 * - Health checks
 * - Connection timeout handling
 * - Retry limit management
 * - Manual reconnection control
 */
export const useConnectionManager = (
  options: ConnectionManagerOptions = {}
): ConnectionManagerReturn => {
  const {
    enabled = true,
    initialRetryDelay = 1000,
    maxRetryDelay = 30000,
    maxRetries = 10,
    backoffMultiplier = 2,
    healthCheckInterval = 30000,
    connectionTimeout = 10000,
  } = options;

  // Network status
  const { isOnline } = useNetworkStatus();

  // State management
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED
  );
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [nextRetryIn, setNextRetryIn] = useState(0);

  // Refs for managing timers and state
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTestRef = useRef<(() => Promise<boolean>) | null>(null);

  // Derived state
  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isReconnecting = connectionState === ConnectionState.RECONNECTING;

  /**
   * Clear all timers
   */
  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (healthCheckTimerRef.current) {
      clearTimeout(healthCheckTimerRef.current);
      healthCheckTimerRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  /**
   * Calculate retry delay with exponential backoff
   */
  const getRetryDelay = useCallback((attempt: number): number => {
    const delay = Math.min(
      initialRetryDelay * Math.pow(backoffMultiplier, attempt),
      maxRetryDelay
    );
    // Add some jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }, [initialRetryDelay, backoffMultiplier, maxRetryDelay]);

  /**
   * Start countdown timer for next retry
   */
  const startCountdown = useCallback((delayMs: number) => {
    let remaining = Math.ceil(delayMs / 1000);
    setNextRetryIn(remaining);

    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setNextRetryIn(remaining);
      
      if (remaining <= 0) {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      }
    }, 1000);
  }, []);

  /**
   * Attempt to establish connection
   */
  const attemptConnection = useCallback(async () => {
    if (!enabled || !isOnline || !connectionTestRef.current) {
      return false;
    }

    setConnectionState(
      retryCount === 0 ? ConnectionState.CONNECTING : ConnectionState.RECONNECTING
    );
    setError(null);

    // Set connection timeout
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      connectionTimeoutRef.current = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, connectionTimeout);
    });

    try {
      // Race between connection test and timeout
      const result = await Promise.race([
        connectionTestRef.current(),
        timeoutPromise,
      ]);

      // Clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      if (result) {
        setConnectionState(ConnectionState.CONNECTED);
        setRetryCount(0);
        setError(null);
        setNextRetryIn(0);
        
        // Start health checks
        if (healthCheckInterval > 0) {
          healthCheckTimerRef.current = setTimeout(() => {
            performHealthCheck();
          }, healthCheckInterval);
        }
        
        return true;
      } else {
        throw new Error('Connection test failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      
      if (retryCount >= maxRetries) {
        setConnectionState(ConnectionState.FAILED);
        return false;
      }

      // Schedule retry
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      
      const retryDelay = getRetryDelay(newRetryCount - 1);
      startCountdown(retryDelay);
      
      retryTimerRef.current = setTimeout(() => {
        attemptConnection();
      }, retryDelay);

      return false;
    }
  }, [
    enabled,
    isOnline,
    retryCount,
    maxRetries,
    connectionTimeout,
    healthCheckInterval,
    getRetryDelay,
    startCountdown,
  ]);

  /**
   * Perform health check
   */
  const performHealthCheck = useCallback(async () => {
    if (!enabled || !isOnline || !connectionTestRef.current) {
      return;
    }

    try {
      const isHealthy = await connectionTestRef.current();
      
      if (isHealthy) {
        // Schedule next health check
        if (healthCheckInterval > 0) {
          healthCheckTimerRef.current = setTimeout(() => {
            performHealthCheck();
          }, healthCheckInterval);
        }
      } else {
        // Connection is unhealthy, trigger reconnection
        setConnectionState(ConnectionState.DISCONNECTED);
        attemptConnection();
      }
    } catch (error) {
      // Health check failed, trigger reconnection
      setConnectionState(ConnectionState.DISCONNECTED);
      attemptConnection();
    }
  }, [enabled, isOnline, healthCheckInterval, attemptConnection]);

  /**
   * Force a reconnection attempt
   */
  const reconnect = useCallback(() => {
    clearTimers();
    setRetryCount(0);
    setError(null);
    setNextRetryIn(0);
    setConnectionState(ConnectionState.DISCONNECTED);
    
    if (enabled && isOnline) {
      attemptConnection();
    }
  }, [enabled, isOnline, attemptConnection, clearTimers]);

  /**
   * Reset the connection manager
   */
  const reset = useCallback(() => {
    clearTimers();
    setConnectionState(ConnectionState.DISCONNECTED);
    setError(null);
    setRetryCount(0);
    setNextRetryIn(0);
  }, [clearTimers]);

  /**
   * Set the connection test function
   */
  const setConnectionTest = useCallback((test: () => Promise<boolean>) => {
    connectionTestRef.current = test;
  }, []);

  // Handle network status changes
  useEffect(() => {
    if (!enabled) return;

    if (isOnline) {
      // Network came back online, attempt connection
      if (connectionState === ConnectionState.DISCONNECTED) {
        attemptConnection();
      }
    } else {
      // Network went offline, disconnect
      clearTimers();
      setConnectionState(ConnectionState.DISCONNECTED);
      setError('Network offline');
    }
  }, [enabled, isOnline, connectionState, attemptConnection, clearTimers]);

  // Initial connection attempt
  useEffect(() => {
    if (enabled && isOnline && connectionState === ConnectionState.DISCONNECTED) {
      attemptConnection();
    }
  }, [enabled, isOnline, connectionState, attemptConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    connectionState,
    isConnected,
    isReconnecting,
    error,
    retryCount,
    nextRetryIn,
    reconnect,
    reset,
    setConnectionTest,
  };
};
