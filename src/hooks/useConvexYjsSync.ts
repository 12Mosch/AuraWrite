import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import * as Y from 'yjs';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useNetworkStatus } from './useNetworkStatus';
import { ConnectionState } from './useConnectionManager';

/**
 * Browser-compatible utility function to compare two Uint8Array instances
 * @param a First Uint8Array to compare
 * @param b Second Uint8Array to compare
 * @returns true if arrays have the same length and identical contents
 */
const areUint8ArraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
};

/**
 * Configuration options for Convex-Yjs synchronization
 */
interface UseConvexYjsSyncOptions {
  /** Document ID to synchronize */
  documentId: Id<"documents">;
  /** Y.Doc instance to synchronize */
  yDoc: Y.Doc;
  /** Shared type within the Y.Doc (e.g., Y.XmlText) */
  sharedType: Y.XmlText;
  /** Debounce delay for sending updates to server (ms) */
  debounceMs?: number;
  /** Whether to enable automatic synchronization */
  enabled?: boolean;
  /** Maximum retry attempts for failed sync operations */
  maxRetries?: number;
}

/**
 * Common interface for sync hooks to ensure type compatibility
 */
export interface SyncHookReturn {
  /** Whether the hook is currently syncing with the server */
  isSyncing: boolean;
  /** Whether the document is fully synchronized */
  isSynced: boolean;
  /** Any synchronization error that occurred */
  syncError: string | null;
  /** Connection status */
  isConnected: boolean;
  /** Force a full resync from server */
  resync: () => Promise<void>;
  /** Connection state (optional for compatibility) */
  connectionState?: ConnectionState;
  /** Force reconnection (optional for compatibility) */
  reconnect?: () => void;
}

/**
 * Return type for the useConvexYjsSync hook
 */
interface UseConvexYjsSyncReturn extends SyncHookReturn {
  /** Manual sync function */
  sync: () => Promise<void>;
}

/**
 * Custom React hook for synchronizing Y.Doc with Convex backend
 * 
 * This hook provides bidirectional synchronization between a Y.Doc instance
 * and the Convex backend, handling:
 * - Real-time updates from server to client
 * - Debounced updates from client to server
 * - Conflict resolution using Y.Doc's CRDT capabilities
 * - Connection management and offline support
 * - Error handling and retry logic
 * 
 * @param options Configuration options for synchronization
 * @returns Synchronization state and control functions
 */
export const useConvexYjsSync = (options: UseConvexYjsSyncOptions): UseConvexYjsSyncReturn => {
  const {
    documentId,
    yDoc,
    debounceMs = 500,
    enabled = true,
    maxRetries = 3,
  } = options;

  // Network status
  const { isOnline } = useNetworkStatus();

  // Convex hooks
  const serverState = useQuery(
    api.yjsSync.subscribeToYjsState,
    enabled && documentId ? { documentId } : "skip"
  );
  const initializeYjsStateMutation = useMutation(api.yjsSync.initializeYjsState);
  const updateYjsStateMutation = useMutation(api.yjsSync.updateYjsState);
  // Note: getYjsState will be called directly when needed for resync

  // State management
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);

  // Refs for managing sync state
  const lastSyncedStateRef = useRef<Uint8Array | null>(null);
  const pendingUpdatesRef = useRef<Uint8Array[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isInitializedRef = useRef(false);

  /**
   * Derive connection state from sync hook's internal state
   */
  const deriveConnectionState = useCallback((
    isOnline: boolean,
    isSyncing: boolean,
    syncError: string | null,
    retryCount: number,
    maxRetries: number,
    isInitialized: boolean
  ): ConnectionState => {
    if (!enabled) {
      return ConnectionState.DISCONNECTED;
    }

    if (!isOnline) {
      return ConnectionState.DISCONNECTED;
    }

    if (syncError) {
      if (retryCount >= maxRetries) {
        return ConnectionState.FAILED;
      }
      return retryCount > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING;
    }

    if (isSyncing) {
      return retryCount > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING;
    }

    if (isInitialized && !syncError) {
      return ConnectionState.CONNECTED;
    }

    return ConnectionState.DISCONNECTED;
  }, [enabled, maxRetries]);

  /**
   * Initialize Y.Doc state on the server if it doesn't exist
   */
  const initializeServerState = useCallback(async () => {
    if (!enabled || isInitializedRef.current || !documentId) return;

    try {
      setIsSyncing(true);

      // Get current Y.Doc state and state vector
      const currentState = Y.encodeStateAsUpdate(yDoc);
      const stateVector = Y.encodeStateVector(yDoc);

      // Try to initialize the server state
      const wasInitialized = await initializeYjsStateMutation({
        documentId,
        initialState: currentState,
        stateVector: stateVector,
      });

      if (wasInitialized) {
        console.log('Y.Doc state initialized on server');
        lastSyncedStateRef.current = currentState;
        setIsSynced(true);
      } else {
        console.log('Y.Doc state already exists on server, will sync with subscription');
        // Server already has state, the subscription will handle syncing
        setIsSynced(false);
      }

      isInitializedRef.current = true;
      setSyncError(null);
    } catch (error) {
      console.error('Failed to initialize server state:', error);
      setSyncError(`Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  }, [yDoc, enabled, documentId, initializeYjsStateMutation]);

  /**
   * Apply server updates to local Y.Doc with conflict resolution
   */
  const applyServerUpdate = useCallback((serverState: Uint8Array, origin: string = 'server') => {
    if (!serverState || serverState.length === 0) return;

    try {
      // Check if we need to apply this update
      const currentState = Y.encodeStateAsUpdate(yDoc);
      if (lastSyncedStateRef.current &&
          areUint8ArraysEqual(currentState, lastSyncedStateRef.current)) {
        return; // No changes needed
      }

      // Apply the server update with origin tracking
      yDoc.transact(() => {
        Y.applyUpdate(yDoc, serverState);
      }, origin);

      lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);

      console.log('Applied server update to Y.Doc');
      setIsSynced(true);
      setSyncError(null);
    } catch (error) {
      console.error('Failed to apply server update:', error);
      setSyncError(`Failed to apply update: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [yDoc]);

  /**
   * Send local updates to server with debouncing
   */
  const sendUpdateToServer = useCallback(async (update: Uint8Array) => {
    if (!enabled || !isOnline || !documentId) return;

    try {
      setIsSyncing(true);

      // Get current state vector for efficient sync
      const stateVector = Y.encodeStateVector(yDoc);

      // Send update to server
      const result = await updateYjsStateMutation({
        documentId,
        update: update,
        stateVector: stateVector,
      });

      if (result.success) {
        lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);
        retryCountRef.current = 0;
        setSyncError(null);
        setIsSynced(true);

        // Apply any conflict resolution update from server
        if (result.conflictUpdate) {
          applyServerUpdate(result.conflictUpdate, 'server-conflict');
        }
      } else {
        throw new Error('Server rejected the update');
      }
    } catch (error) {
      console.error('Failed to send update to server:', error);

      // Implement retry logic
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        setTimeout(() => sendUpdateToServer(update), 1000 * retryCountRef.current);
      } else {
        setSyncError(`Sync failed after ${maxRetries} retries: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [yDoc, enabled, isOnline, documentId, maxRetries, updateYjsStateMutation, applyServerUpdate]);

  /**
   * Debounced function to send updates to server
   */
  const debouncedSendUpdate = useCallback((update: Uint8Array) => {
    // Add update to pending queue
    pendingUpdatesRef.current.push(update);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      if (pendingUpdatesRef.current.length > 0) {
        // Merge all pending updates
        const mergedUpdate = Y.mergeUpdates(pendingUpdatesRef.current);
        pendingUpdatesRef.current = [];
        sendUpdateToServer(mergedUpdate);
      }
    }, debounceMs);
  }, [sendUpdateToServer, debounceMs]);

  /**
   * Manual sync function
   */
  const sync = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsSyncing(true);
      const currentState = Y.encodeStateAsUpdate(yDoc);
      await sendUpdateToServer(currentState);
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, yDoc, sendUpdateToServer]);

  /**
   * Force a full resync from server
   */
  const resync = useCallback(async () => {
    if (!enabled || !documentId) return;

    try {
      setIsSyncing(true);

      // For resync, we'll rely on the serverState from our subscription
      // If serverState is available, apply it; otherwise initialize
      if (serverState?.yjsState) {
        // Apply the server state to our local Y.Doc
        // Convert ArrayBuffer to Uint8Array
        const serverStateBytes = new Uint8Array(serverState.yjsState);
        applyServerUpdate(serverStateBytes, 'server-resync');
        console.log('Successfully resynced with server state');
        setIsSynced(true);
      } else {
        // No server state exists, initialize it with our current state
        console.log('No server state found, initializing...');
        await initializeServerState();
      }

      setSyncError(null);
    } catch (error) {
      console.error('Failed to resync:', error);
      setSyncError(`Resync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, documentId, serverState, applyServerUpdate, initializeServerState]);

  /**
   * Reconnect function that attempts to re-establish sync
   */
  const reconnect = useCallback(async () => {
    if (!enabled) {
      console.log('Reconnect called but sync is disabled');
      return;
    }

    console.log('Attempting to reconnect...');

    // Reset retry count and error state
    retryCountRef.current = 0;
    setSyncError(null);

    // Update connection state to show we're attempting to reconnect
    setConnectionState(ConnectionState.CONNECTING);

    try {
      // Attempt to resync with the server
      await resync();
      console.log('Reconnection successful');
    } catch (error) {
      console.error('Reconnection failed:', error);
      setSyncError(`Reconnection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setConnectionState(ConnectionState.FAILED);
    }
  }, [enabled, resync]);

  // Initialize server state when component mounts
  useEffect(() => {
    if (enabled && !isInitializedRef.current) {
      initializeServerState();
    }
  }, [enabled, initializeServerState]);

  // Handle real-time server state updates
  useEffect(() => {
    if (!enabled || !serverState) return;

    // Apply server updates when they arrive
    if (serverState.yjsState && isInitializedRef.current) {
      const serverStateBytes = new Uint8Array(serverState.yjsState);

      // Only apply if the server state is different from our last synced state
      const currentState = Y.encodeStateAsUpdate(yDoc);
      if (!lastSyncedStateRef.current ||
          !areUint8ArraysEqual(currentState, lastSyncedStateRef.current)) {

        // Check if server state is newer
        if (!serverState.yjsUpdatedAt ||
            !lastSyncedStateRef.current ||
            serverState.yjsUpdatedAt > (Date.now() - 5000)) { // 5 second tolerance

          console.log('Applying server state update from subscription');
          applyServerUpdate(serverStateBytes, 'server-subscription');
        }
      }
    }

    setIsConnected(true);
  }, [enabled, serverState, yDoc, applyServerUpdate]);

  // Set up Y.Doc update listener
  useEffect(() => {
    if (!enabled) return;

    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      // Only sync updates that don't originate from server
      if (origin !== 'server') {
        debouncedSendUpdate(update);
      }
    };

    yDoc.on('update', handleUpdate);

    return () => {
      yDoc.off('update', handleUpdate);
      
      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, yDoc, debouncedSendUpdate]);

  // Update connection status and state based on network and sync state
  useEffect(() => {
    const newConnectionState = deriveConnectionState(
      isOnline,
      isSyncing,
      syncError,
      retryCountRef.current,
      maxRetries,
      isInitializedRef.current
    );

    setConnectionState(newConnectionState);
    setIsConnected(newConnectionState === ConnectionState.CONNECTED);
  }, [isOnline, isSyncing, syncError, maxRetries, deriveConnectionState]);

  return {
    isSyncing,
    isSynced,
    syncError,
    isConnected,
    sync,
    resync,
    // Dynamic connection state and reconnect functionality
    connectionState,
    reconnect,
  };
};
