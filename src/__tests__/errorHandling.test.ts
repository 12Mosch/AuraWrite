/**
 * Comprehensive error handling tests
 * 
 * This test suite covers all error handling scenarios including:
 * - Network failures and retry logic
 * - Sync conflicts and resolution
 * - Offline mode transitions
 * - Error context and recovery actions
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ConvexError } from 'convex/values';
import * as Y from 'yjs';

import { useConvexErrorHandler } from '../hooks/useConvexErrorHandler';
import { useSyncErrorHandler } from '../hooks/useSyncErrorHandler';
import { useConnectionManager, ConnectionState } from '../hooks/useConnectionManager';
import { useOfflineMode, OfflineMode } from '../hooks/useOfflineMode';
import { ErrorFactory, ErrorCategory, ErrorSeverity } from '../types/errors';

// Mock dependencies
vi.mock('../contexts/ErrorContext', () => ({
  useErrorHandler: vi.fn(() => vi.fn()),
}));

vi.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(() => ({ isOnline: true })),
}));

describe('Error Handling System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ConvexErrorHandler', () => {
    it('should handle ConvexError instances correctly', async () => {
      const { result } = renderHook(() => useConvexErrorHandler());
      
      const convexError = new ConvexError({
        message: 'Unauthorized access',
        code: 'unauthorized',
      });

      const context = {
        operation: 'mutation' as const,
        functionName: 'testMutation',
        args: { test: 'data' },
      };

      const appError = await result.current.handleConvexError(convexError, context);

      expect(appError.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(appError.severity).toBe(ErrorSeverity.HIGH);
      expect(appError.retryable).toBe(false);
      expect(appError.code).toBe('CONVEX_MUTATION_ERROR');
    });

    it('should categorize write conflicts correctly', async () => {
      const { result } = renderHook(() => useConvexErrorHandler());
      
      const conflictError = new ConvexError('Write conflict detected');
      const context = {
        operation: 'mutation' as const,
        functionName: 'updateDocument',
      };

      const appError = await result.current.handleConvexError(conflictError, context);

      expect(appError.category).toBe(ErrorCategory.CONFLICT);
      expect(appError.retryable).toBe(true);
      expect(appError.maxRetries).toBe(5);
    });

    it('should handle network errors with retry logic', async () => {
      const { result } = renderHook(() => useConvexErrorHandler());
      
      const networkError = new Error('fetch failed');
      networkError.name = 'TypeError';
      
      const context = {
        operation: 'query' as const,
        functionName: 'getDocument',
      };

      const appError = await result.current.handleConvexError(networkError, context);

      expect(appError.category).toBe(ErrorCategory.NETWORK);
      expect(appError.retryable).toBe(true);
      expect(appError.maxRetries).toBe(3);
    });

    it('should wrap mutations with error handling', async () => {
      const { result } = renderHook(() => useConvexErrorHandler());
      
      const mockMutation = vi.fn().mockRejectedValue(new ConvexError('Test error'));
      const wrappedMutation = result.current.withMutationErrorHandling(
        mockMutation,
        'testMutation'
      );

      await expect(wrappedMutation('arg1', 'arg2')).rejects.toThrow();
      expect(mockMutation).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('SyncErrorHandler', () => {
    let yDoc: Y.Doc;

    beforeEach(() => {
      yDoc = new Y.Doc();
    });

    afterEach(() => {
      yDoc.destroy();
    });

    it('should detect sync conflicts correctly', () => {
      const { result } = renderHook(() => useSyncErrorHandler());
      
      const conflictError = new Error('Write conflict detected');
      expect(result.current.isSyncConflict(conflictError)).toBe(true);

      const regularError = new Error('Network timeout');
      expect(result.current.isSyncConflict(regularError)).toBe(false);
    });

    it('should categorize conflict types', () => {
      const { result } = renderHook(() => useSyncErrorHandler());
      
      const writeConflict = new Error('Write conflict detected');
      expect(result.current.getConflictType(writeConflict)).toBe('write_conflict');

      const versionMismatch = new Error('Version mismatch');
      expect(result.current.getConflictType(versionMismatch)).toBe('version_mismatch');

      const permissionError = new Error('Permission denied');
      expect(result.current.getConflictType(permissionError)).toBe('permission_denied');
    });

    it('should resolve conflicts with different strategies', async () => {
      const { result } = renderHook(() => useSyncErrorHandler());
      
      const localDoc = new Y.Doc();
      const remoteDoc = new Y.Doc();
      
      // Add different content to each doc
      localDoc.getText('content').insert(0, 'local content');
      remoteDoc.getText('content').insert(0, 'remote content');

      // Test local wins strategy
      const localWinsResult = await result.current.resolveConflicts(
        localDoc,
        remoteDoc,
        'local_wins' as any
      );
      expect(localWinsResult.resolved).toBe(true);
      expect(localWinsResult.strategy).toBe('local_wins');

      // Test remote wins strategy
      const remoteWinsResult = await result.current.resolveConflicts(
        localDoc,
        remoteDoc,
        'remote_wins' as any
      );
      expect(remoteWinsResult.resolved).toBe(true);
      expect(remoteWinsResult.strategy).toBe('remote_wins');

      // Test merge strategy
      const mergeResult = await result.current.resolveConflicts(
        localDoc,
        remoteDoc,
        'merge' as any
      );
      expect(mergeResult.resolved).toBe(true);
      expect(mergeResult.mergedDoc).toBeDefined();

      localDoc.destroy();
      remoteDoc.destroy();
    });

    it('should handle sync errors with proper context', async () => {
      const { result } = renderHook(() => useSyncErrorHandler());
      
      const syncError = new Error('Sync failed');
      const context = {
        documentId: 'test-doc',
        operation: 'push' as const,
        yDoc,
        userId: 'user123',
      };

      const appError = await result.current.handleSyncError(syncError, context);

      expect(appError.category).toBe(ErrorCategory.SYNC);
      expect(appError.context?.operation).toBe('push');
      expect(appError.context?.userId).toBe('user123');
    });
  });

  describe('ConnectionManager', () => {
    it('should handle connection failures with retry logic', async () => {
      const mockConnectionTest = vi.fn()
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(true);

      const { result } = renderHook(() => useConnectionManager({
        initialRetryDelay: 100,
        maxRetries: 3,
      }));

      act(() => {
        result.current.setConnectionTest(mockConnectionTest);
      });

      // Wait for connection attempts
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      expect(mockConnectionTest).toHaveBeenCalledTimes(3);
      expect(result.current.connectionState).toBe(ConnectionState.CONNECTED);
    });

    it('should fail after max retries', async () => {
      const mockConnectionTest = vi.fn().mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => useConnectionManager({
        initialRetryDelay: 50,
        maxRetries: 2,
      }));

      act(() => {
        result.current.setConnectionTest(mockConnectionTest);
      });

      // Wait for all retry attempts
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      });

      expect(result.current.connectionState).toBe(ConnectionState.FAILED);
      expect(result.current.retryCount).toBe(2);
    });

    it('should handle network status changes', async () => {
      const { useNetworkStatus } = await import('../hooks/useNetworkStatus');
      const mockUseNetworkStatus = useNetworkStatus as Mock;

      // Start offline
      mockUseNetworkStatus.mockReturnValue({ isOnline: false });

      const { result, rerender } = renderHook(() => useConnectionManager());

      expect(result.current.connectionState).toBe(ConnectionState.DISCONNECTED);

      // Go online
      mockUseNetworkStatus.mockReturnValue({ isOnline: true });
      rerender();

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.connectionState).toBe(ConnectionState.CONNECTING);
    });
  });

  describe('OfflineMode', () => {
    let yDoc: Y.Doc;

    beforeEach(() => {
      yDoc = new Y.Doc();
    });

    afterEach(() => {
      yDoc.destroy();
    });

    it('should detect offline mode correctly', () => {
      const { useNetworkStatus } = require('../hooks/useNetworkStatus');
      useNetworkStatus.mockReturnValue({ isOnline: false });

      const { result } = renderHook(() => useOfflineMode({
        documentId: 'test-doc',
        yDoc,
      }));

      expect(result.current.mode).toBe(OfflineMode.OFFLINE);
      expect(result.current.isOffline).toBe(true);
    });

    it('should track offline operations', async () => {
      const { useNetworkStatus } = require('../hooks/useNetworkStatus');
      useNetworkStatus.mockReturnValue({ isOnline: false });

      const { result } = renderHook(() => useOfflineMode({
        documentId: 'test-doc',
        yDoc,
      }));

      // Simulate document update while offline
      act(() => {
        yDoc.getText('content').insert(0, 'offline content');
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.hasUnsyncedChanges).toBe(true);
      expect(result.current.pendingOperations).toBeGreaterThan(0);
    });

    it('should sync when coming back online', async () => {
      const { useNetworkStatus } = require('../hooks/useNetworkStatus');
      const mockUseNetworkStatus = useNetworkStatus as Mock;

      // Start offline
      mockUseNetworkStatus.mockReturnValue({ isOnline: false });

      const { result, rerender } = renderHook(() => useOfflineMode({
        documentId: 'test-doc',
        yDoc,
      }));

      // Make changes while offline
      act(() => {
        yDoc.getText('content').insert(0, 'offline content');
      });

      // Go online
      mockUseNetworkStatus.mockReturnValue({ isOnline: true });
      rerender();

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(result.current.mode).toBe(OfflineMode.SYNCING);
    });

    it('should handle sync conflicts', async () => {
      const { result } = renderHook(() => useOfflineMode({
        documentId: 'test-doc',
        yDoc,
        autoResolveConflicts: false,
      }));

      // Simulate conflict resolution
      await act(async () => {
        await result.current.resolveConflicts('local');
      });

      // Should not throw error
      expect(result.current.error).toBeNull();
    });
  });

  describe('ErrorFactory', () => {
    it('should create network errors correctly', () => {
      const error = ErrorFactory.network(
        'TEST_NETWORK_ERROR',
        'Test network error',
        {
          statusCode: 500,
          timeout: 5000,
        }
      );

      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.code).toBe('TEST_NETWORK_ERROR');
      expect(error.message).toBe('Test network error');
      expect(error.context?.statusCode).toBe(500);
      expect(error.retryable).toBe(true);
    });

    it('should create sync errors correctly', () => {
      const error = ErrorFactory.sync(
        'TEST_SYNC_ERROR',
        'Test sync error',
        'doc-123',
        'push'
      );

      expect(error.category).toBe(ErrorCategory.SYNC);
      expect(error.documentId).toBe('doc-123');
      expect(error.operation).toBe('push');
      expect(error.retryable).toBe(true);
      expect(error.maxRetries).toBe(5);
    });

    it('should create persistence errors correctly', () => {
      const error = ErrorFactory.persistence(
        'TEST_PERSISTENCE_ERROR',
        'Test persistence error',
        'indexeddb'
      );

      expect(error.category).toBe(ErrorCategory.PERSISTENCE);
      expect(error.storageType).toBe('indexeddb');
      expect(error.retryable).toBe(false);
    });
  });

  describe('Error Recovery', () => {
    it('should provide appropriate recovery strategies', () => {
      const networkError = ErrorFactory.network('NET_ERROR', 'Network failed');
      expect(networkError.recoveryStrategy).toBe('retry');

      const authError = ErrorFactory.authentication('AUTH_ERROR', 'Auth failed');
      expect(authError.recoveryStrategy).toBe('manual');

      const persistenceError = ErrorFactory.persistence('PERSIST_ERROR', 'Storage failed', 'indexeddb');
      expect(persistenceError.recoveryStrategy).toBe('fallback');
    });

    it('should handle retry counts correctly', () => {
      const error = ErrorFactory.network('NET_ERROR', 'Network failed', {
        retryCount: 2,
        maxRetries: 3,
      });

      expect(error.retryCount).toBe(2);
      expect(error.maxRetries).toBe(3);
      expect(error.retryable).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle end-to-end error flow', async () => {
      const yDoc = new Y.Doc();

      // Mock network going offline
      const { useNetworkStatus } = require('../hooks/useNetworkStatus');
      useNetworkStatus.mockReturnValue({ isOnline: false });

      const { result: offlineResult } = renderHook(() => useOfflineMode({
        documentId: 'integration-test',
        yDoc,
      }));

      // Make changes while offline
      act(() => {
        yDoc.getText('content').insert(0, 'offline changes');
      });

      expect(offlineResult.current.isOffline).toBe(true);
      expect(offlineResult.current.hasUnsyncedChanges).toBe(true);

      // Network comes back online
      useNetworkStatus.mockReturnValue({ isOnline: true });

      await act(async () => {
        await offlineResult.current.forceSync();
      });

      // Should attempt to sync
      expect(offlineResult.current.isSyncing).toBe(false);

      yDoc.destroy();
    });

    it('should handle cascading errors correctly', async () => {
      const { result: convexHandler } = renderHook(() => useConvexErrorHandler());
      const { result: syncHandler } = renderHook(() => useSyncErrorHandler());

      // Simulate a network error that causes sync failure
      const networkError = new Error('Network timeout');
      const syncContext = {
        documentId: 'cascade-test',
        operation: 'push' as const,
        yDoc: new Y.Doc(),
      };

      const syncError = await syncHandler.current.handleSyncError(networkError, syncContext);

      expect(syncError.category).toBe(ErrorCategory.SYNC);
      expect(syncError.retryable).toBe(true);

      syncContext.yDoc.destroy();
    });
  });
});
