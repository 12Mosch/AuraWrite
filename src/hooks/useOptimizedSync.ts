import { useCallback, useRef, useEffect, useState } from 'react';
import { useMutation, useConvex } from 'convex/react';
import * as Y from 'yjs';
import { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { useNetworkStatus } from './useNetworkStatus';
import { useConnectionManager } from './useConnectionManager';
import { SyncHookReturn } from './useConvexYjsSync';

/**
 * Configuration options for optimized sync
 */
export interface OptimizedSyncOptions {
  /** Document ID to sync */
  documentId: Id<"documents">;
  /** Y.Doc instance */
  yDoc: Y.Doc;
  /** Shared type for content */
  sharedType: Y.XmlText;
  /** Whether sync is enabled */
  enabled?: boolean;
  /** Debounce time for batching updates (ms) */
  debounceMs?: number;
  /** Maximum batch size for updates */
  maxBatchSize?: number;
  /** Maximum time to wait before forcing a sync (ms) */
  maxWaitTime?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Whether to use compression for updates */
  useCompression?: boolean;
}

/**
 * Return type for the optimized sync hook
 */
export interface OptimizedSyncReturn extends SyncHookReturn {
  /** Get sync statistics */
  getStats: () => SyncStats;
  /** Clear sync statistics */
  clearStats: () => void;
}

/**
 * Sync statistics for monitoring performance
 */
export interface SyncStats {
  totalUpdates: number;
  batchedUpdates: number;
  failedUpdates: number;
  averageLatency: number;
  compressionRatio: number;
  lastSyncTime: number;
}

/**
 * Update batch for efficient syncing
 */
interface UpdateBatch {
  updates: Uint8Array[];
  timestamp: number;
  retryCount: number;
}

/**
 * Enhanced hook for optimized real-time synchronization
 * 
 * Features:
 * - Update batching for reduced network calls
 * - Compression for smaller payloads
 * - Intelligent retry logic
 * - Performance monitoring
 * - Connection pooling optimization
 * - Selective syncing based on content changes
 */
export const useOptimizedSync = (options: OptimizedSyncOptions): OptimizedSyncReturn => {
  const {
    documentId,
    yDoc,
    enabled = true,
    debounceMs = 300,
    maxBatchSize = 10,
    maxWaitTime = 2000,
    maxRetries = 3,
  } = options;

  // Network status
  const { isOnline } = useNetworkStatus();

  // Convex client and mutations
  const convex = useConvex();
  const applyBatchedUpdatesMutation = useMutation(api.yjsSync.applyBatchedYjsUpdates);

  // Connection management with automatic reconnection
  const connectionManager = useConnectionManager({
    enabled,
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
    maxRetries: 10,
    backoffMultiplier: 2,
    healthCheckInterval: 30000,
    connectionTimeout: 10000,
  });

  // State management
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Refs for optimization
  const updateBatchRef = useRef<UpdateBatch | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const forceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncedStateRef = useRef<Uint8Array | null>(null);
  const statsRef = useRef<SyncStats>({
    totalUpdates: 0,
    batchedUpdates: 0,
    failedUpdates: 0,
    averageLatency: 0,
    compressionRatio: 1,
    lastSyncTime: 0,
  });



  /**
   * Send batched updates to server with retry logic
   */
  const sendBatchedUpdates = useCallback(async (batch: UpdateBatch) => {
    if (!enabled || !isOnline) return;

    const startTime = Date.now();
    setIsSyncing(true);

    try {
      // Get current state vector for efficient sync
      const stateVector = Y.encodeStateVector(yDoc);

      // Send batched updates to server
      const result = await applyBatchedUpdatesMutation({
        documentId,
        updates: batch.updates,
        stateVector: stateVector,
        clientId: yDoc.clientID,
      });

      if (result.success) {
        const latency = Date.now() - startTime;

        // Update statistics
        statsRef.current.totalUpdates += result.appliedUpdates;
        statsRef.current.batchedUpdates += 1;

        // Update average latency using running average formula
        const sampleCount = statsRef.current.batchedUpdates;
        statsRef.current.averageLatency =
          (statsRef.current.averageLatency * (sampleCount - 1) + latency) / sampleCount;
        statsRef.current.lastSyncTime = Date.now();

        // Update last synced state
        lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);
        setIsSynced(true);
        setSyncError(null);

        // Apply any conflict resolution update from server
        if (result.conflictUpdate) {
          yDoc.transact(() => {
            Y.applyUpdate(yDoc, result.conflictUpdate!);
          }, 'server-conflict');
        }

        // Reset retry count on success
        batch.retryCount = 0;
      } else {
        throw new Error('Server rejected the batched updates');
      }
    } catch (error) {
      console.error('Failed to send batched updates:', error);
      statsRef.current.failedUpdates += 1;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Implement retry logic
      if (batch.retryCount < maxRetries) {
        batch.retryCount += 1;
        setSyncError(`Sync failed (attempt ${batch.retryCount}/${maxRetries}): ${errorMessage}`);

        // Schedule retry with exponential backoff
        const retryDelay = Math.min(1000 * Math.pow(2, batch.retryCount - 1), 10000);
        setTimeout(() => {
          sendBatchedUpdates(batch);
        }, retryDelay);
      } else {
        setSyncError(`Sync failed after ${maxRetries} attempts: ${errorMessage}`);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, isOnline, yDoc, documentId, maxRetries, applyBatchedUpdatesMutation]);

  /**
   * Add update to batch and schedule sync
   */
  const addUpdateToBatch = useCallback((update: Uint8Array) => {
    if (!enabled) return;

    // Initialize or add to existing batch
    if (!updateBatchRef.current) {
      updateBatchRef.current = {
        updates: [update],
        timestamp: Date.now(),
        retryCount: 0,
      };
    } else {
      updateBatchRef.current.updates.push(update);
    }

    // Clear existing timers
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (forceTimerRef.current) {
      clearTimeout(forceTimerRef.current);
    }

    // Check if we should send immediately
    const shouldSendImmediately = 
      updateBatchRef.current.updates.length >= maxBatchSize ||
      Date.now() - updateBatchRef.current.timestamp >= maxWaitTime;

    if (shouldSendImmediately) {
      const batch = updateBatchRef.current;
      updateBatchRef.current = null;
      sendBatchedUpdates(batch);
    } else {
      // Set up debounced send
      debounceTimerRef.current = setTimeout(() => {
        if (updateBatchRef.current) {
          const batch = updateBatchRef.current;
          updateBatchRef.current = null;
          sendBatchedUpdates(batch);
        }
      }, debounceMs);

      // Set up force send timer
      forceTimerRef.current = setTimeout(() => {
        if (updateBatchRef.current) {
          const batch = updateBatchRef.current;
          updateBatchRef.current = null;
          sendBatchedUpdates(batch);
        }
      }, maxWaitTime);
    }
  }, [enabled, maxBatchSize, maxWaitTime, debounceMs, sendBatchedUpdates]);



  /**
   * Force a full resync from server
   * Fetches the latest document state and updates local Y.Doc accordingly
   */
  const resync = useCallback(async () => {
    if (!enabled || !isOnline) {
      console.log('Resync skipped: sync disabled or offline');
      return;
    }

    try {
      setIsSyncing(true);
      console.log('Starting full resync from server...');

      // Fetch the latest document state from server
      const serverData = await convex.query(api.yjsSync.getYjsState, {
        documentId
      });

      if (!serverData) {
        throw new Error('Failed to fetch document state from server');
      }

      // If server has Y.js state, apply it to local document
      if (serverData.yjsState) {
        console.log('Applying server state to local Y.Doc');

        // Convert ArrayBuffer to Uint8Array for Y.js
        const serverStateBytes = new Uint8Array(serverData.yjsState);

        // Apply server state to local Y.Doc with proper origin tracking
        yDoc.transact(() => {
          Y.applyUpdate(yDoc, serverStateBytes);
        }, 'server-resync');

        // Update last synced state reference
        lastSyncedStateRef.current = Y.encodeStateAsUpdate(yDoc);

        console.log('Successfully applied server state during resync');
        setIsSynced(true);
        setSyncError(null);
      } else {
        // No server state exists - this means the document hasn't been initialized yet
        console.log('No server state found during resync');
        throw new Error('Server state not found. Document may not be initialized yet. Please try syncing normally first.');
      }

    } catch (error) {
      console.error('Failed to resync:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSyncError(`Resync failed: ${errorMessage}`);
      setIsSynced(false);
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, isOnline, convex, documentId, yDoc]);

  /**
   * Get current sync statistics
   */
  const getStats = useCallback((): SyncStats => {
    return { ...statsRef.current };
  }, []);

  /**
   * Clear sync statistics
   */
  const clearStats = useCallback(() => {
    statsRef.current = {
      totalUpdates: 0,
      batchedUpdates: 0,
      failedUpdates: 0,
      averageLatency: 0,
      compressionRatio: 1,
      lastSyncTime: 0,
    };
  }, []);

  // Set up Y.Doc update listener
  useEffect(() => {
    if (!enabled) return;

    const handleUpdate = (update: Uint8Array, origin: any) => {
      // Only sync updates that don't originate from server
      if (origin !== 'server') {
        addUpdateToBatch(update);
      }
    };

    yDoc.on('update', handleUpdate);

    return () => {
      yDoc.off('update', handleUpdate);
      
      // Clear timers
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (forceTimerRef.current) {
        clearTimeout(forceTimerRef.current);
      }
    };
  }, [enabled, yDoc, addUpdateToBatch]);

  // Set up connection test for the connection manager
  useEffect(() => {
    const connectionTest = async (): Promise<boolean> => {
      try {
        // Test connectivity by querying a lightweight endpoint
        const response = await fetch('/api/health', { 
          method: 'HEAD',
          cache: 'no-cache',
        });
        return response.ok;
      } catch {
        return false;
      }
    };

    connectionManager.setConnectionTest(connectionTest);
  }, [connectionManager]);

  return {
    isSyncing,
    isSynced,
    syncError: syncError || connectionManager.error,
    isConnected: connectionManager.isConnected,
    connectionState: connectionManager.connectionState,
    resync,
    reconnect: connectionManager.reconnect,
    getStats,
    clearStats,
  };
};
