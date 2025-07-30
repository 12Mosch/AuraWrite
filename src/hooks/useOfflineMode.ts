/**
 * Offline mode management hook
 * 
 * This hook provides comprehensive offline mode support including:
 * - Local-first editing with automatic sync when online
 * - Offline state detection and management
 * - Conflict resolution for offline/online transitions
 * - Graceful degradation of features
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useNetworkStatus } from './useNetworkStatus';
import { useErrorHandler } from '../contexts/ErrorContext';
import { useSyncErrorHandler, ConflictResolutionStrategy } from './useSyncErrorHandler';
import { ErrorFactory } from '../types/errors';

/**
 * Offline mode states
 */
export enum OfflineMode {
  ONLINE = 'online',
  OFFLINE = 'offline',
  SYNCING = 'syncing',
  CONFLICT = 'conflict',
}

/**
 * Offline operation types
 */
interface OfflineOperation {
  id: string;
  type: 'insert' | 'delete' | 'format' | 'update';
  timestamp: number;
  data: any;
  applied: boolean;
}

/**
 * Offline mode options
 */
interface OfflineModeOptions {
  /** Document ID */
  documentId: string;
  /** Y.Doc instance */
  yDoc: Y.Doc;
  /** Whether to enable offline mode */
  enabled?: boolean;
  /** Maximum offline operations to store */
  maxOfflineOperations?: number;
  /** Sync timeout in milliseconds */
  syncTimeout?: number;
  /** Whether to auto-resolve conflicts */
  autoResolveConflicts?: boolean;
}

/**
 * Offline mode return type
 */
interface OfflineModeReturn {
  /** Current offline mode state */
  mode: OfflineMode;
  /** Whether currently offline */
  isOffline: boolean;
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Whether there are unsynced changes */
  hasUnsyncedChanges: boolean;
  /** Number of pending offline operations */
  pendingOperations: number;
  /** Last sync timestamp */
  lastSyncTime: Date | null;
  /** Current error if any */
  error: string | null;
  /** Force sync when online */
  forceSync: () => Promise<void>;
  /** Clear offline data */
  clearOfflineData: () => void;
  /** Get offline operations */
  getOfflineOperations: () => OfflineOperation[];
  /** Resolve conflicts manually */
  resolveConflicts: (resolution: 'local' | 'remote' | 'merge') => Promise<void>;
}

/**
 * Hook for managing offline mode
 */
export const useOfflineMode = (options: OfflineModeOptions): OfflineModeReturn => {
  const {
    documentId,
    yDoc,
    enabled = true,
    maxOfflineOperations = 1000,
    autoResolveConflicts = true,
  } = options;

  const { isOnline } = useNetworkStatus();
  const handleError = useErrorHandler();
  const { handleSyncError, resolveConflicts } = useSyncErrorHandler();
  const convex = useConvex();

  // State
  const [mode, setMode] = useState<OfflineMode>(
    isOnline ? OfflineMode.ONLINE : OfflineMode.OFFLINE
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const offlineOperationsRef = useRef<OfflineOperation[]>([]);
  const lastSyncedStateRef = useRef<Uint8Array | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Derived state
  const isOffline = mode === OfflineMode.OFFLINE;
  const pendingOperations = offlineOperationsRef.current.filter(op => !op.applied).length;

  /**
   * Add offline operation to queue
   */
  const addOfflineOperation = useCallback((
    type: OfflineOperation['type'],
    data: any
  ) => {
    const operation: OfflineOperation = {
      id: `${Date.now()}_${performance.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      timestamp: Date.now(),
      data,
      applied: false,
    };

    offlineOperationsRef.current.push(operation);

    // Limit queue size
    if (offlineOperationsRef.current.length > maxOfflineOperations) {
      offlineOperationsRef.current = offlineOperationsRef.current.slice(-maxOfflineOperations);
    }

    setHasUnsyncedChanges(true);
    
    // Save to localStorage for persistence
    try {
      localStorage.setItem(
        `offline_ops_${documentId}`,
        JSON.stringify(offlineOperationsRef.current)
      );
    } catch (error) {
      console.warn('Failed to save offline operations:', error);
      const storageError = ErrorFactory.persistence(
        'OFFLINE_STORAGE_FAILED',
        'Failed to save offline changes',
        'localstorage',
        {
          retryable: true,
          context: { documentId, operationCount: offlineOperationsRef.current.length }
        }
      );
      handleError(storageError);
    }
  }, [documentId, maxOfflineOperations]);

  /**
   * Load offline operations from localStorage
   */
  const loadOfflineOperations = useCallback(() => {
    try {
      const stored = localStorage.getItem(`offline_ops_${documentId}`);
      if (stored) {
        offlineOperationsRef.current = JSON.parse(stored);
        setHasUnsyncedChanges(offlineOperationsRef.current.some(op => !op.applied));
      }
    } catch (error) {
      console.warn('Failed to load offline operations:', error);
      offlineOperationsRef.current = [];
    }
  }, [documentId]);

  /**
   * Clear offline operations
   */
  const clearOfflineOperations = useCallback(() => {
    offlineOperationsRef.current = [];
    setHasUnsyncedChanges(false);
    
    try {
      localStorage.removeItem(`offline_ops_${documentId}`);
    } catch (error) {
      console.warn('Failed to clear offline operations:', error);
    }
  }, [documentId]);

  /**
   * Sync offline operations when coming back online
   */
  const syncOfflineOperations = useCallback(async (): Promise<boolean> => {
    if (!isOnline || !hasUnsyncedChanges) {
      return true;
    }

    setIsSyncing(true);
    setError(null);

    try {
      // Get current document state
      const currentState = Y.encodeStateAsUpdate(yDoc);
      
      // Check if there are conflicts with server state by comparing with actual server state
      const hasConflicts = await checkForConflicts(convex, documentId, currentState);
      
      if (hasConflicts && !autoResolveConflicts) {
        setMode(OfflineMode.CONFLICT);
        return false;
      }

      // Apply offline operations
      for (const operation of offlineOperationsRef.current) {
        if (!operation.applied) {
          try {
            await applyOfflineOperation(operation);
            operation.applied = true;
          } catch (error) {
            console.error('Failed to apply offline operation:', error);
            
            const syncError = await handleSyncError(error, {
              documentId,
              operation: 'push',
              yDoc,
            });
            
            setError(syncError.message);
            return false;
          }
        }
      }

      // Mark as synced
      lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);
      setLastSyncTime(new Date());
      setHasUnsyncedChanges(false);
      setMode(OfflineMode.ONLINE);
      
      // Clear applied operations
      offlineOperationsRef.current = offlineOperationsRef.current.filter(op => !op.applied);
      
      return true;
    } catch (error) {
      console.error('Sync failed:', error);
      
      const syncError = await handleSyncError(error, {
        documentId,
        operation: 'push',
        yDoc,
      });
      
      setError(syncError.message);
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [
    isOnline,
    hasUnsyncedChanges,
    yDoc,
    documentId,
    autoResolveConflicts,
    handleSyncError,
  ]);

  /**
   * Force sync operation
   */
  const forceSync = useCallback(async (): Promise<void> => {
    if (!isOnline) {
      const error = ErrorFactory.network(
        'FORCE_SYNC_OFFLINE',
        'Cannot force sync while offline',
        { isOffline: true }
      );
      handleError(error);
      return;
    }

    await syncOfflineOperations();
  }, [isOnline, syncOfflineOperations, handleError]);

  /**
   * Clear all offline data
   */
  const clearOfflineData = useCallback(() => {
    clearOfflineOperations();
    setError(null);
    setMode(isOnline ? OfflineMode.ONLINE : OfflineMode.OFFLINE);
  }, [clearOfflineOperations, isOnline]);

  /**
   * Get offline operations
   */
  const getOfflineOperations = useCallback((): OfflineOperation[] => {
    return [...offlineOperationsRef.current];
  }, []);

  /**
   * Resolve conflicts manually
   */
  const resolveConflictsManually = useCallback(async (
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<void> => {
    if (mode !== OfflineMode.CONFLICT) {
      return;
    }

    try {
      setIsSyncing(true);
      
      // This would typically involve fetching the remote document
      // and using the conflict resolution strategy
      const remoteDoc = new Y.Doc(); // Placeholder for remote document
      
      const result = await resolveConflicts(
        yDoc,
        remoteDoc,
        resolution === 'local' ? ConflictResolutionStrategy.LOCAL_WINS :
        resolution === 'remote' ? ConflictResolutionStrategy.REMOTE_WINS :
        ConflictResolutionStrategy.MERGE
      );

      if (result.resolved && result.mergedDoc) {
        // Apply the resolved document
        Y.applyUpdate(yDoc, Y.encodeStateAsUpdate(result.mergedDoc));
        setMode(OfflineMode.ONLINE);
        setError(null);
      } else {
        setError('Failed to resolve conflicts');
      }
    } catch (error) {
      console.error('Conflict resolution failed:', error);
      setError('Conflict resolution failed');
    } finally {
      setIsSyncing(false);
    }
  }, [mode, yDoc, resolveConflicts]);

  // Handle network status changes
  useEffect(() => {
    if (!enabled) return;

    if (isOnline) {
      if (mode === OfflineMode.OFFLINE) {
        setMode(OfflineMode.SYNCING);
        syncOfflineOperations();
      }
    } else {
      setMode(OfflineMode.OFFLINE);
      setIsSyncing(false);
    }
  }, [isOnline, mode, enabled, syncOfflineOperations]);

  // Set up Y.Doc update listener for offline operations
  useEffect(() => {
    if (!enabled) return;

    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      // Only track local updates when offline
      if (origin !== 'server' && mode === OfflineMode.OFFLINE) {
        addOfflineOperation('update', {
          update: Array.from(update),
          origin,
        });
      }
    };

    yDoc.on('update', handleUpdate);

    return () => {
      yDoc.off('update', handleUpdate);
    };
  }, [enabled, mode, yDoc, addOfflineOperation]);

  // Load offline operations on mount
  useEffect(() => {
    if (enabled) {
      loadOfflineOperations();
    }
  }, [enabled, loadOfflineOperations]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return {
    mode,
    isOffline,
    isSyncing,
    hasUnsyncedChanges,
    pendingOperations,
    lastSyncTime,
    error,
    forceSync,
    clearOfflineData,
    getOfflineOperations,
    resolveConflicts: resolveConflictsManually,
  };
};

/**
 * Check for conflicts with server state by comparing local and server document states
 *
 * @param convex - The Convex client instance
 * @param documentId - The document ID to check conflicts for
 * @param currentState - The current local document state as Uint8Array
 * @returns Promise<boolean> - true if conflicts exist, false otherwise
 */
async function checkForConflicts(convex: any, documentId: string, currentState: Uint8Array): Promise<boolean> {
  try {
    // Fetch the current server state using Convex API
    if (!convex) {
      console.warn('Convex client not available for conflict detection');
      return false;
    }

    const serverData = await convex.query(api.yjsSync.getYjsState, { documentId: documentId as Id<"documents"> });

    // If no server state exists, there are no conflicts
    if (!serverData?.yjsState) {
      return false;
    }

    // Convert server state from ArrayBuffer to Uint8Array
    const serverState = new Uint8Array(serverData.yjsState);

    // If states are identical, no conflicts
    if (currentState.length === serverState.length &&
        Buffer.from(currentState).equals(Buffer.from(serverState))) {
      return false;
    }

    // Create temporary Y.Doc instances to compare states
    const localDoc = new Y.Doc();
    const serverDoc = new Y.Doc();

    // Apply the states to the documents
    Y.applyUpdate(localDoc, currentState);
    Y.applyUpdate(serverDoc, serverState);

    // Get state vectors for efficient conflict detection
    const localStateVector = Y.encodeStateVector(localDoc);
    const serverStateVector = Y.encodeStateVector(serverDoc);

    // Check if both documents have changes the other doesn't know about
    // This indicates a true conflict where both sides have diverged
    const localDiff = Y.diffUpdate(Y.encodeStateAsUpdate(localDoc), serverStateVector);
    const serverDiff = Y.diffUpdate(Y.encodeStateAsUpdate(serverDoc), localStateVector);

    // A conflict exists if both sides have changes the other doesn't know about
    const hasConflict = localDiff.length > 0 && serverDiff.length > 0;

    if (hasConflict) {
      console.log('Conflict detected: both local and server have divergent changes');
    }

    return hasConflict;

  } catch (error) {
    console.error('Error checking for conflicts:', error);
    // In case of error, assume no conflicts to avoid blocking sync
    return false;
  }
}

/**
 * Apply offline operation to document
 */
async function applyOfflineOperation(operation: OfflineOperation): Promise<void> {
  // This would apply the specific operation to the document
  // Implementation depends on the operation type and data structure
  console.log('Applying offline operation:', operation);
}
