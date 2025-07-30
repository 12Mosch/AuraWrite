import React, { useState, useEffect, useMemo } from 'react';
import { Descendant } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { createEditor } from 'slate';
import { withYjs, YjsEditor } from '@slate-yjs/core';
import { useYjsDocument } from '../hooks/useYjsDocument';
import { useConvexYjsSync } from '../hooks/useConvexYjsSync';
import { useOptimizedSync as useOptimizedSyncHook } from '../hooks/useOptimizedSync';
import { usePresence } from '../hooks/usePresence';
import { DocumentHeader } from './DocumentHeader';
import { PresenceIndicator } from './PresenceIndicator';
import { SyncPerformanceMonitor, CompactPerformanceIndicator } from './SyncPerformanceMonitor';
import { ConnectionStatus, SimpleConnectionIndicator } from './ConnectionStatus';
import { Id } from '../../convex/_generated/dataModel';

/**
 * Props for the ConvexCollaborativeEditor component
 */
interface ConvexCollaborativeEditorProps {
  /** Document ID to edit */
  documentId: Id<"documents">;
  /** CSS class name for styling */
  className?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Callback when editor content changes */
  onChange?: (value: Descendant[]) => void;
  /** Whether to enable real-time synchronization */
  enableSync?: boolean;
  /** Whether to show the document header with real-time metadata */
  showHeader?: boolean;
  /** CSS class name for the header */
  headerClassName?: string;
  /** Whether to use optimized sync (default: true) */
  useOptimizedSync?: boolean;
  /** Whether to show performance monitoring (default: false) */
  showPerformanceMonitor?: boolean;
}

/**
 * Collaborative editor component with Convex-Yjs synchronization
 * 
 * This component combines:
 * - Slate.js for rich text editing
 * - Y.js for CRDT-based collaboration
 * - Convex for real-time backend synchronization
 * - IndexedDB for offline persistence
 */
export const ConvexCollaborativeEditor: React.FC<ConvexCollaborativeEditorProps> = ({
  documentId,
  className = '',
  placeholder = 'Start typing...',
  onChange,
  enableSync = true,
  showHeader = true,
  headerClassName = '',
  useOptimizedSync = true,
  showPerformanceMonitor = false,
}) => {
  // Initial editor value
  const initialValue: Descendant[] = [
    { type: 'paragraph', children: [{ text: '' }] }
  ];

  // Initialize Y.Doc and shared types using the existing hook
  const { 
    yDoc, 
    sharedType, 
    indexeddbProvider, 
    isSynced: isLocalSynced, 
    persistenceError, 
    persistenceAvailable 
  } = useYjsDocument({
    documentId,
    initialValue,
    enablePersistence: true,
    enableGarbageCollection: true
  });

  // Initialize synchronization (optimized or regular)
  const regularSync = useConvexYjsSync({
    documentId,
    yDoc,
    sharedType,
    enabled: enableSync && !useOptimizedSync,
    debounceMs: 500,
    maxRetries: 3,
  });

  const optimizedSyncHook = useOptimizedSyncHook({
    documentId,
    yDoc,
    sharedType,
    enabled: enableSync && useOptimizedSync,
    debounceMs: 300,
    maxBatchSize: 10,
    maxWaitTime: 2000,
    maxRetries: 3,
    useCompression: true,
  });

  // Use the appropriate sync based on configuration
  const {
    isSyncing,
    isSynced: isServerSynced,
    syncError,
    isConnected,
    resync,
  } = useOptimizedSync ? optimizedSyncHook : regularSync;

  // Get additional properties from optimized sync if available
  const connectionState = useOptimizedSync ? optimizedSyncHook.connectionState : 'connected' as any;
  const reconnect = useOptimizedSync ? optimizedSyncHook.reconnect : () => {};

  // Initialize real-time presence tracking
  const { updatePresence } = usePresence(documentId, {
    enabled: enableSync,
    updateInterval: 5000,
    trackCursor: true,
    trackSelection: true,
  });

  // Create Slate editor with Yjs integration
  const editor = useMemo(() => {
    const e = withReact(withYjs(createEditor(), sharedType));
    
    // Ensure editor has a consistent structure
    const { normalizeNode } = e;
    e.normalizeNode = (entry) => {
      // Ensure the editor always has at least one paragraph
      if (e.children.length === 0) {
        e.insertNode({ type: 'paragraph', children: [{ text: '' }] });
        return;
      }
      
      normalizeNode(entry);
    };
    
    return e;
  }, [sharedType]);

  // Manage editor value state
  const [value, setValue] = useState<Descendant[]>(initialValue);

  // Connect/disconnect the Yjs editor
  useEffect(() => {
    // Connect the editor to start synchronizing with the shared type
    YjsEditor.connect(editor);

    // Wait for IndexedDB to sync if persistence is enabled
    if (indexeddbProvider) {
      indexeddbProvider.whenSynced.then(() => {
        console.log('Y.Doc synced with IndexedDB');
      });
    }

    // Cleanup function to disconnect the editor
    return () => {
      YjsEditor.disconnect(editor);
    };
  }, [editor, indexeddbProvider]);

  // Handle editor value changes
  const handleChange = (newValue: Descendant[]) => {
    setValue(newValue);
    onChange?.(newValue);

    // Update presence with current selection
    if (enableSync && editor.selection) {
      updatePresence(undefined, editor.selection);
    }
  };

  // Calculate overall sync status
  const overallSyncStatus = useMemo(() => {
    if (!enableSync) return 'disabled';
    if (isSyncing) return 'syncing';
    if (syncError) return 'error';
    if (!isConnected) return 'offline';
    if (isLocalSynced && isServerSynced) return 'synced';
    return 'pending';
  }, [enableSync, isSyncing, syncError, isConnected, isLocalSynced, isServerSynced]);

  // Sync status indicator component
  const SyncStatusIndicator = () => {
    const getStatusColor = () => {
      switch (overallSyncStatus) {
        case 'synced': return 'text-green-600';
        case 'syncing': return 'text-blue-600';
        case 'error': return 'text-red-600';
        case 'offline': return 'text-yellow-600';
        case 'pending': return 'text-gray-600';
        case 'disabled': return 'text-gray-400';
        default: return 'text-gray-600';
      }
    };

    const getStatusText = () => {
      switch (overallSyncStatus) {
        case 'synced': return 'Synced';
        case 'syncing': return 'Syncing...';
        case 'error': return 'Sync Error';
        case 'offline': return 'Offline';
        case 'pending': return 'Connecting...';
        case 'disabled': return 'Sync Disabled';
        default: return 'Unknown';
      }
    };

    return (
      <div className={`text-xs ${getStatusColor()} flex items-center gap-1`}>
        <div className={`w-2 h-2 rounded-full ${
          overallSyncStatus === 'synced' ? 'bg-green-600' :
          overallSyncStatus === 'syncing' ? 'bg-blue-600 animate-pulse' :
          overallSyncStatus === 'error' ? 'bg-red-600' :
          overallSyncStatus === 'offline' ? 'bg-yellow-600' :
          'bg-gray-600'
        }`} />
        {getStatusText()}
      </div>
    );
  };

  // Error display component
  const ErrorDisplay = () => {
    if (!syncError && !persistenceError) return null;

    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-red-800">Synchronization Issues</h4>
            {syncError && (
              <p className="text-sm text-red-700 mt-1">Server sync: {syncError}</p>
            )}
            {persistenceError && (
              <p className="text-sm text-red-700 mt-1">Local storage: {persistenceError}</p>
            )}
          </div>
          <div className="flex gap-2">
            {syncError && (
              <button
                onClick={() => resync()}
                className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded"
                disabled={isSyncing}
              >
                Retry Sync
              </button>
            )}
            {!isConnected && reconnect && (
              <button
                onClick={() => reconnect()}
                className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded"
                disabled={isSyncing}
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`convex-collaborative-editor ${className}`}>
      {/* Document Header with Real-time Metadata */}
      {showHeader && (
        <div className="border-b bg-white">
          <DocumentHeader
            documentId={documentId}
            className={`p-4 ${headerClassName}`}
            showCollaborators={true}
            showLastUpdated={true}
            editable={true}
          />
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between p-2 bg-gray-50 border-b">
        <div className="flex items-center space-x-4">
          <SyncStatusIndicator />
          {/* Real-time Presence Indicator */}
          <PresenceIndicator
            documentId={documentId}
            size="sm"
            maxVisible={3}
            showNames={false}
          />

          {/* Performance Monitor (compact) */}
          {useOptimizedSync && (
            <CompactPerformanceIndicator
              getStats={optimizedSyncHook.getStats}
            />
          )}

          {/* Connection Status */}
          <SimpleConnectionIndicator
            connectionState={connectionState}
            isSyncing={isSyncing}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {!persistenceAvailable && (
            <span className="text-yellow-600">⚠ Local storage unavailable</span>
          )}
          <span>Document: {documentId}</span>
        </div>
      </div>

      {/* Error display */}
      <ErrorDisplay />

      {/* Editor */}
      <div className="relative">
        <Slate
          editor={editor}
          value={value}
          onChange={handleChange}
        >
          <Editable
            placeholder={placeholder}
            className="min-h-[200px] p-4 focus:outline-none"
            spellCheck
            autoFocus
          />
        </Slate>

        {/* Loading overlay */}
        {!isLocalSynced && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
            <div className="text-gray-600">Loading document...</div>
          </div>
        )}
      </div>

      {/* Performance Monitor (detailed) */}
      {showPerformanceMonitor && useOptimizedSync && (
        <SyncPerformanceMonitor
          getStats={optimizedSyncHook.getStats}
          clearStats={optimizedSyncHook.clearStats}
          visible={true}
          updateInterval={1000}
        />
      )}

      {/* Enhanced Connection Status (development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="border-t">
          <ConnectionStatus
            connectionState={connectionState}
            isSyncing={isSyncing}
            error={syncError}
            onReconnect={reconnect}
            showDetails={true}
            size="sm"
            className="m-2"
          />

          <div className="p-2 bg-gray-100 text-xs text-gray-600 space-y-1">
            <div>Local synced: {isLocalSynced ? '✓' : '✗'}</div>
            <div>Server synced: {isServerSynced ? '✓' : '✗'}</div>
            <div>Y.Doc client ID: {yDoc.clientID}</div>
            <div>Sync mode: {useOptimizedSync ? 'Optimized' : 'Regular'}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConvexCollaborativeEditor;
