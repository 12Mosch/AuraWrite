/**
 * Sync-specific error handling hook
 * 
 * This hook provides specialized error handling for synchronization operations,
 * including conflict resolution, merge strategies, and sync state management.
 */

import { useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { useErrorHandler } from '../contexts/ErrorContext';
import { ErrorFactory, SyncError, ConflictError } from '../types/errors';

/**
 * Sync conflict types
 */
export enum SyncConflictType {
  WRITE_CONFLICT = 'write_conflict',
  VERSION_MISMATCH = 'version_mismatch',
  SCHEMA_CONFLICT = 'schema_conflict',
  PERMISSION_DENIED = 'permission_denied',
}

/**
 * Conflict resolution strategies
 */
export enum ConflictResolutionStrategy {
  LOCAL_WINS = 'local_wins',
  REMOTE_WINS = 'remote_wins',
  MERGE = 'merge',
  MANUAL = 'manual',
  LAST_WRITE_WINS = 'last_write_wins',
}

/**
 * Sync operation context
 */
interface SyncOperationContext {
  documentId: string;
  operation: 'push' | 'pull' | 'merge';
  yDoc: Y.Doc;
  retryCount?: number;
  userId?: string;
}

/**
 * Conflict resolution result
 */
interface ConflictResolutionResult {
  resolved: boolean;
  strategy: ConflictResolutionStrategy;
  mergedDoc?: Y.Doc;
  conflicts?: Array<{
    path: string;
    localValue: any;
    remoteValue: any;
    resolution: any;
  }>;
}

/**
 * Sync error handler return type
 */
interface SyncErrorHandlerReturn {
  /** Handle sync errors with automatic conflict resolution */
  handleSyncError: (error: unknown, context: SyncOperationContext) => Promise<SyncError>;
  /** Resolve conflicts between local and remote changes */
  resolveConflicts: (
    localDoc: Y.Doc,
    remoteDoc: Y.Doc,
    strategy: ConflictResolutionStrategy
  ) => Promise<ConflictResolutionResult>;
  /** Check if error is a sync conflict */
  isSyncConflict: (error: unknown) => boolean;
  /** Get conflict type from error */
  getConflictType: (error: unknown) => SyncConflictType | null;
  /** Create conflict resolution strategy based on error */
  getResolutionStrategy: (conflictType: SyncConflictType) => ConflictResolutionStrategy;
}

/**
 * Hook for handling sync-specific errors
 */
export const useSyncErrorHandler = (): SyncErrorHandlerReturn => {
  const handleError = useErrorHandler();
  const conflictHistoryRef = useRef<Map<string, number>>(new Map());

  /**
   * Handle sync errors with proper categorization and resolution
   */
  const handleSyncError = useCallback(async (
    error: unknown,
    context: SyncOperationContext
  ): Promise<SyncError> => {
    const { documentId, operation, yDoc, retryCount = 0, userId } = context;

    let syncError: SyncError;

    if (isSyncConflict(error)) {
      // Handle sync conflicts
      const conflictType = getConflictType(error);
      const strategy = conflictType ? getResolutionStrategy(conflictType) : ConflictResolutionStrategy.MANUAL;

      syncError = ErrorFactory.sync(
        `SYNC_CONFLICT_${conflictType?.toUpperCase() || 'UNKNOWN'}`,
        `Sync conflict in ${operation} operation: ${String(error)}`,
        documentId,
        operation,
        {
          severity: 'high' as any,
          retryable: strategy !== ConflictResolutionStrategy.MANUAL,
          maxRetries: 5,
          retryCount,
          context: {
            conflictType,
            resolutionStrategy: strategy,
            userId,
            documentState: Y.encodeStateAsUpdate(yDoc),
          },
        }
      );

      // Track conflict frequency
      const conflictKey = `${documentId}:${conflictType}`;
      const currentCount = conflictHistoryRef.current.get(conflictKey) || 0;
      conflictHistoryRef.current.set(conflictKey, currentCount + 1);

      // If conflicts are frequent, suggest different strategy
      if (currentCount > 3) {
        syncError.context = {
          ...syncError.context,
          frequentConflicts: true,
          suggestedStrategy: ConflictResolutionStrategy.LAST_WRITE_WINS,
        };
      }
    } else if (error instanceof Error) {
      // Handle regular errors
      syncError = ErrorFactory.sync(
        'SYNC_OPERATION_FAILED',
        `Sync ${operation} failed: ${error.message}`,
        documentId,
        operation,
        {
          retryable: true,
          maxRetries: 3,
          retryCount,
          context: {
            originalError: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
            userId,
          },
        }
      );
    } else {
      // Handle unknown errors
      syncError = ErrorFactory.sync(
        'SYNC_UNKNOWN_ERROR',
        `Unknown sync error in ${operation}: ${String(error)}`,
        documentId,
        operation,
        {
          retryable: false,
          context: {
            unknownError: error,
            userId,
          },
        }
      );
    }

    // Add to error context
    handleError(syncError);

    return syncError;
  }, [handleError]);

  /**
   * Resolve conflicts between local and remote documents
   */
  const resolveConflicts = useCallback(async (
    localDoc: Y.Doc,
    remoteDoc: Y.Doc,
    strategy: ConflictResolutionStrategy
  ): Promise<ConflictResolutionResult> => {
    try {
      switch (strategy) {
        case ConflictResolutionStrategy.LOCAL_WINS:
          return {
            resolved: true,
            strategy,
            mergedDoc: localDoc,
          };

        case ConflictResolutionStrategy.REMOTE_WINS:
          return {
            resolved: true,
            strategy,
            mergedDoc: remoteDoc,
          };

        case ConflictResolutionStrategy.LAST_WRITE_WINS:
          // Compare timestamps and use the most recent
          const localTime = getDocumentTimestamp(localDoc);
          const remoteTime = getDocumentTimestamp(remoteDoc);
          
          return {
            resolved: true,
            strategy,
            mergedDoc: localTime > remoteTime ? localDoc : remoteDoc,
          };

        case ConflictResolutionStrategy.MERGE:
          // Perform automatic merge using Y.js CRDT capabilities
          const mergedDoc = new Y.Doc();
          
          // Apply both local and remote updates
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(localDoc));
          Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(remoteDoc));
          
          return {
            resolved: true,
            strategy,
            mergedDoc,
          };

        case ConflictResolutionStrategy.MANUAL:
        default:
          // Return conflicts for manual resolution
          const conflicts = detectConflicts(localDoc, remoteDoc);
          
          return {
            resolved: false,
            strategy,
            conflicts,
          };
      }
    } catch (error) {
      console.error('Conflict resolution failed:', error);
      
      return {
        resolved: false,
        strategy,
        conflicts: [{
          path: 'root',
          localValue: 'unknown',
          remoteValue: 'unknown',
          resolution: 'failed',
        }],
      };
    }
  }, []);

  /**
   * Check if error is a sync conflict
   */
  const isSyncConflict = useCallback((error: unknown): boolean => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('conflict') ||
        message.includes('version mismatch') ||
        message.includes('concurrent modification') ||
        message.includes('write conflict')
      );
    }
    return false;
  }, []);

  /**
   * Get conflict type from error
   */
  const getConflictType = useCallback((error: unknown): SyncConflictType | null => {
    if (!(error instanceof Error)) return null;

    const message = error.message.toLowerCase();
    
    if (message.includes('write conflict')) {
      return SyncConflictType.WRITE_CONFLICT;
    } else if (message.includes('version mismatch')) {
      return SyncConflictType.VERSION_MISMATCH;
    } else if (message.includes('schema')) {
      return SyncConflictType.SCHEMA_CONFLICT;
    } else if (message.includes('permission') || message.includes('unauthorized')) {
      return SyncConflictType.PERMISSION_DENIED;
    }
    
    return null;
  }, []);

  /**
   * Get resolution strategy based on conflict type
   */
  const getResolutionStrategy = useCallback((
    conflictType: SyncConflictType
  ): ConflictResolutionStrategy => {
    switch (conflictType) {
      case SyncConflictType.WRITE_CONFLICT:
        return ConflictResolutionStrategy.MERGE;
      case SyncConflictType.VERSION_MISMATCH:
        return ConflictResolutionStrategy.LAST_WRITE_WINS;
      case SyncConflictType.SCHEMA_CONFLICT:
        return ConflictResolutionStrategy.MANUAL;
      case SyncConflictType.PERMISSION_DENIED:
        return ConflictResolutionStrategy.MANUAL;
      default:
        return ConflictResolutionStrategy.MANUAL;
    }
  }, []);

  return {
    handleSyncError,
    resolveConflicts,
    isSyncConflict,
    getConflictType,
    getResolutionStrategy,
  };
};

/**
 * Get document timestamp from Y.Doc metadata
 */
function getDocumentTimestamp(doc: Y.Doc): number {
  try {
    // Try to get timestamp from document metadata
    const meta = doc.getMap('meta');
    const timestamp = meta.get('lastModified');
    return typeof timestamp === 'number' ? timestamp : Date.now();
  } catch {
    return Date.now();
  }
}

/**
 * Detect conflicts between two Y.Doc instances
 */
function detectConflicts(localDoc: Y.Doc, remoteDoc: Y.Doc): Array<{
  path: string;
  localValue: any;
  remoteValue: any;
  resolution: any;
}> {
  const conflicts: Array<{
    path: string;
    localValue: any;
    remoteValue: any;
    resolution: any;
  }> = [];

  try {
    // Compare document content
    const localContent = localDoc.get('content', Y.XmlText);
    const remoteContent = remoteDoc.get('content', Y.XmlText);
    
    if (localContent.toString() !== remoteContent.toString()) {
      conflicts.push({
        path: 'content',
        localValue: localContent.toString(),
        remoteValue: remoteContent.toString(),
        resolution: 'manual_required',
      });
    }
  } catch (error) {
    console.error('Error detecting conflicts:', error);
  }

  return conflicts;
}
