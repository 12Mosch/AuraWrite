/**
 * Sync-specific error handling hook
 * 
 * This hook provides specialized error handling for synchronization operations,
 * including conflict resolution, merge strategies, and sync state management.
 */

import { useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { useErrorHandler } from '../contexts/ErrorContext';
import { ErrorFactory, SyncError, ErrorSeverity } from '../types/errors';

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
 * Conflict information with enhanced metadata
 */
interface ConflictInfo {
  path: string;
  localValue: any;
  remoteValue: any;
  resolution: any;
  conflictType?: string;
  similarity?: number;
  canAutoResolve?: boolean;
  error?: string;
}

/**
 * Conflict resolution result
 */
interface ConflictResolutionResult {
  resolved: boolean;
  strategy: ConflictResolutionStrategy;
  mergedDoc?: Y.Doc;
  conflicts?: Array<ConflictInfo>;
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
          severity: ErrorSeverity.HIGH,
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
 * Detect conflicts between two Y.Doc instances using Y.js state vectors
 * for more granular and accurate conflict detection
 */
function detectConflicts(localDoc: Y.Doc, remoteDoc: Y.Doc): Array<ConflictInfo> {
  const conflicts: Array<ConflictInfo> = [];

  try {
    // Get the shared types
    const localContent = localDoc.get('content', Y.XmlText);
    const remoteContent = remoteDoc.get('content', Y.XmlText);

    // Use Y.js's built-in state vectors for more accurate conflict detection
    const localState = Y.encodeStateVector(localDoc);
    const remoteState = Y.encodeStateVector(remoteDoc);

    // Check if documents have diverged by computing differences
    const localDiff = Y.diffUpdate(Y.encodeStateAsUpdate(localDoc), remoteState);
    const remoteDiff = Y.diffUpdate(Y.encodeStateAsUpdate(remoteDoc), localState);

    // Real conflict exists if both documents have changes the other doesn't know about
    if (localDiff.length > 0 && remoteDiff.length > 0) {
      // Analyze the nature of the conflict
      const conflictAnalysis = analyzeConflictType(localContent, remoteContent);

      conflicts.push({
        path: 'content',
        localValue: localContent.toString(),
        remoteValue: remoteContent.toString(),
        resolution: conflictAnalysis.resolution,
        ...conflictAnalysis.metadata,
      });
    }

    // Check metadata conflicts
    const metadataConflicts = detectMetadataConflicts(localDoc, remoteDoc);
    conflicts.push(...metadataConflicts);

    // Check for structural conflicts in nested types
    const structuralConflicts = detectStructuralConflicts(localDoc, remoteDoc);
    conflicts.push(...structuralConflicts);

  } catch (error) {
    console.error('Error detecting conflicts:', error);
    // Fallback to basic conflict detection
    conflicts.push({
      path: 'root',
      localValue: 'detection_failed',
      remoteValue: 'detection_failed',
      resolution: 'manual_required',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return conflicts;
}

/**
 * Analyze the type and severity of content conflicts
 */
function analyzeConflictType(
  localContent: Y.XmlText,
  remoteContent: Y.XmlText
): {
  resolution: string;
  metadata: Record<string, any>;
} {
  const localText = localContent.toString();
  const remoteText = remoteContent.toString();

  // Check if it's just a simple append/prepend (easier to resolve)
  if (localText.includes(remoteText) || remoteText.includes(localText)) {
    return {
      resolution: 'auto_merge_possible',
      metadata: {
        conflictType: 'append_conflict',
        canAutoResolve: true,
      },
    };
  }

  // Check for overlapping edits in the same region
  const similarity = calculateTextSimilarity(localText, remoteText);
  if (similarity > 0.8) {
    return {
      resolution: 'minor_conflict',
      metadata: {
        conflictType: 'minor_edit_conflict',
        similarity,
        canAutoResolve: true,
      },
    };
  }

  // Check for completely different content (major conflict)
  if (similarity < 0.3) {
    return {
      resolution: 'major_conflict',
      metadata: {
        conflictType: 'major_content_conflict',
        similarity,
        canAutoResolve: false,
      },
    };
  }

  return {
    resolution: 'manual_required',
    metadata: {
      conflictType: 'moderate_conflict',
      similarity,
      canAutoResolve: false,
    },
  };
}

/**
 * Detect conflicts in document metadata
 */
function detectMetadataConflicts(localDoc: Y.Doc, remoteDoc: Y.Doc): Array<ConflictInfo> {
  const conflicts: Array<ConflictInfo> = [];

  try {
    const localMeta = localDoc.getMap('meta');
    const remoteMeta = remoteDoc.getMap('meta');

    // Compare specific metadata fields that matter for conflict resolution
    const criticalFields = ['lastModified', 'version', 'author', 'title'];

    for (const field of criticalFields) {
      const localValue = localMeta.get(field);
      const remoteValue = remoteMeta.get(field);

      if (localValue !== undefined && remoteValue !== undefined && localValue !== remoteValue) {
        conflicts.push({
          path: `meta.${field}`,
          localValue,
          remoteValue,
          resolution: field === 'lastModified' ? 'use_latest' : 'manual_required',
        });
      }
    }
  } catch (error) {
    console.error('Error detecting metadata conflicts:', error);
  }

  return conflicts;
}

/**
 * Detect structural conflicts in nested Y.js types
 */
function detectStructuralConflicts(localDoc: Y.Doc, remoteDoc: Y.Doc): Array<ConflictInfo> {
  const conflicts: Array<ConflictInfo> = [];

  try {
    // Check for conflicts in nested maps and arrays
    const sharedTypeNames = ['settings', 'annotations', 'comments'];

    for (const typeName of sharedTypeNames) {
      const localType = localDoc.getMap(typeName);
      const remoteType = remoteDoc.getMap(typeName);

      // Compare the JSON representations for structural differences
      const localJSON = JSON.stringify(localType.toJSON());
      const remoteJSON = JSON.stringify(remoteType.toJSON());

      if (localJSON !== remoteJSON) {
        conflicts.push({
          path: typeName,
          localValue: localType.toJSON(),
          remoteValue: remoteType.toJSON(),
          resolution: 'merge_required',
        });
      }
    }
  } catch (error) {
    console.error('Error detecting structural conflicts:', error);
  }

  return conflicts;
}

/**
 * Calculate text similarity using a simple algorithm
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  if (text1 === text2) return 1;
  if (text1.length === 0 || text2.length === 0) return 0;

  // Use Levenshtein distance for similarity calculation
  const maxLength = Math.max(text1.length, text2.length);
  const distance = levenshteinDistance(text1, text2);

  return 1 - (distance / maxLength);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}
