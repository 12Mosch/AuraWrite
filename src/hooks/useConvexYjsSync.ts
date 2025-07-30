import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useConvex } from 'convex/react';
import * as Y from 'yjs';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useNetworkStatus } from './useNetworkStatus';

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
 * Return type for the useConvexYjsSync hook
 */
interface UseConvexYjsSyncReturn {
  /** Whether the hook is currently syncing with the server */
  isSyncing: boolean;
  /** Whether the document is fully synchronized */
  isSynced: boolean;
  /** Any synchronization error that occurred */
  syncError: string | null;
  /** Connection status */
  isConnected: boolean;
  /** Manual sync function */
  sync: () => Promise<void>;
  /** Force a full resync from server */
  resync: () => Promise<void>;
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
    sharedType,
    debounceMs = 500,
    enabled = true,
    maxRetries = 3,
  } = options;

  // Convex hooks
  const convex = useConvex();
  const yjsState = useQuery(api.yjsSync.subscribeToYjsState, enabled ? { documentId } : "skip");
  const updateYjsState = useMutation(api.yjsSync.updateYjsState);
  const applyYjsUpdate = useMutation(api.yjsSync.applyYjsUpdate);
  const initializeYjsState = useMutation(api.yjsSync.initializeYjsState);

  // Network status
  const { isOnline } = useNetworkStatus();

  // State management
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs for managing sync state
  const lastSyncedStateRef = useRef<Uint8Array | null>(null);
  const pendingUpdatesRef = useRef<Uint8Array[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isInitializedRef = useRef(false);

  /**
   * Initialize Y.Doc state on the server if it doesn't exist
   */
  const initializeServerState = useCallback(async () => {
    if (!enabled || isInitializedRef.current) return;

    try {
      const currentState = Y.encodeStateAsUpdate(yDoc);
      const stateVector = Y.encodeStateVector(yDoc);

      const initialized = await initializeYjsState({
        documentId,
        initialState: currentState,
        stateVector,
      });

      if (initialized) {
        console.log('Y.Doc state initialized on server');
        lastSyncedStateRef.current = currentState;
        isInitializedRef.current = true;
      }
    } catch (error) {
      console.error('Failed to initialize server state:', error);
      setSyncError(`Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [documentId, yDoc, initializeYjsState, enabled]);

  /**
   * Apply server updates to local Y.Doc with conflict resolution
   */
  const applyServerUpdate = useCallback((serverState: Uint8Array, origin: string = 'server') => {
    if (!serverState || serverState.length === 0) return;

    try {
      // Check if we need to apply this update
      const currentState = Y.encodeStateAsUpdate(yDoc);
      if (lastSyncedStateRef.current &&
          currentState.length === lastSyncedStateRef.current.length &&
          currentState.every((byte, index) => byte === lastSyncedStateRef.current![index])) {
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
    if (!enabled || !isOnline) return;

    try {
      setIsSyncing(true);
      
      const stateVector = Y.encodeStateVector(yDoc);
      const result = await applyYjsUpdate({
        documentId,
        update,
        clientId: yDoc.clientID,
      });

      if (result.success) {
        lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);
        retryCountRef.current = 0;
        setSyncError(null);
        
        // Apply any server update if provided
        if (result.serverUpdate) {
          applyServerUpdate(result.serverUpdate);
        }
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
  }, [documentId, yDoc, applyYjsUpdate, enabled, isOnline, maxRetries, applyServerUpdate]);

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
    if (!enabled) return;

    try {
      setIsSyncing(true);
      
      // Get fresh state from server
      const freshState = await convex.query(api.yjsSync.getYjsState, { documentId });
      
      if (freshState.yjsState) {
        applyServerUpdate(freshState.yjsState);
      }
    } catch (error) {
      console.error('Failed to resync:', error);
      setSyncError(`Resync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, convex, documentId, applyServerUpdate]);

  // Initialize server state when component mounts
  useEffect(() => {
    if (enabled && !isInitializedRef.current) {
      initializeServerState();
    }
  }, [enabled, initializeServerState]);

  // Handle server state updates
  useEffect(() => {
    if (!enabled || !yjsState?.yjsState) return;

    applyServerUpdate(yjsState.yjsState);
    setIsConnected(true);
  }, [enabled, yjsState, applyServerUpdate]);

  // Set up Y.Doc update listener
  useEffect(() => {
    if (!enabled) return;

    const handleUpdate = (update: Uint8Array, origin: any) => {
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

  // Update connection status based on network and sync state
  useEffect(() => {
    setIsConnected(isOnline && !syncError);
  }, [isOnline, syncError]);

  return {
    isSyncing,
    isSynced,
    syncError,
    isConnected,
    sync,
    resync,
  };
};
