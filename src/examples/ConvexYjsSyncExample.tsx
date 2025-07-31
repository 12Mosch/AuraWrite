import React, { useState } from 'react';
import { ConvexCollaborativeEditor } from '../components/ConvexCollaborativeEditor';
import { CollaborationDashboard, FloatingCollaborationPanel } from '../components/CollaborationDashboard';
import { ConnectionState } from '../hooks/useConnectionManager';
import { Id } from '../../convex/_generated/dataModel';

/**
 * Example component demonstrating the useConvexYjsSync hook
 * 
 * This example shows how to:
 * - Use the ConvexCollaborativeEditor component
 * - Handle different document IDs
 * - Display sync status
 * - Handle errors gracefully
 */
export const ConvexYjsSyncExample: React.FC = () => {
  // Example document IDs (replace with real IDs from your app)
  const exampleDocuments: Array<{ id: string; title: string }> = [
    { id: 'doc1' as Id<"documents">, title: 'Meeting Notes' },
    { id: 'doc2' as Id<"documents">, title: 'Project Plan' },
    { id: 'doc3' as Id<"documents">, title: 'Brainstorming Session' },
  ];

  const [selectedDocId, setSelectedDocId] = useState<Id<"documents">>(
    exampleDocuments[0].id as Id<"documents">
  );

  // Demo configuration state
  const [showDashboard, setShowDashboard] = useState(true);
  const [useOptimizedSync, setUseOptimizedSync] = useState(true);
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState(false);
  const [showFloatingPanel, setShowFloatingPanel] = useState(false);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Enhanced Real-time Collaboration Demo</h1>

      {/* Configuration Panel */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-3">Demo Configuration</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showDashboard}
              onChange={(e) => setShowDashboard(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show Dashboard</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={useOptimizedSync}
              onChange={(e) => setUseOptimizedSync(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Optimized Sync</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showPerformanceMonitor}
              onChange={(e) => setShowPerformanceMonitor(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Performance Monitor</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showFloatingPanel}
              onChange={(e) => setShowFloatingPanel(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Floating Panel</span>
          </label>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Select Document</h2>
        <div className="flex gap-2">
          {exampleDocuments.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelectedDocId(doc.id as Id<"documents">)}
              className={`px-4 py-2 rounded-md border ${
                selectedDocId === doc.id
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {doc.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Column */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Collaborative Editor</h2>
          <div className="border rounded-lg overflow-hidden shadow-sm">
            <ConvexCollaborativeEditor
              documentId={selectedDocId}
              placeholder="Start typing to see real-time collaboration in action..."
              className="min-h-[500px]"
              enableSync={true}
              showHeader={true}
              useOptimizedSync={useOptimizedSync}
              showPerformanceMonitor={showPerformanceMonitor}
              onChange={(value) => {
                console.log('Editor content changed:', value);
              }}
            />
          </div>
        </div>

        {/* Dashboard Column */}
        {showDashboard && (
          <div className="lg:col-span-1">
            <h2 className="text-lg font-semibold mb-3">Collaboration Dashboard</h2>
            <CollaborationDashboard
              documentId={selectedDocId}
              connectionState={ConnectionState.CONNECTED} // This would come from your sync hook
              isSyncing={false}
              syncError={null}
              onReconnect={() => console.log('Reconnect requested')}
              defaultExpanded={true}
            />
          </div>
        )}
      </div>

      {/* Floating Panel */}
      {showFloatingPanel && (
        <FloatingCollaborationPanel
          documentId={selectedDocId}
          connectionState={ConnectionState.CONNECTED}
          isSyncing={false}
          syncError={null}
          onReconnect={() => console.log('Reconnect requested')}
          position="bottom-right"
        />
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How to Test Collaboration</h3>
        <ol className="list-decimal list-inside text-blue-800 space-y-1">
          <li>Open this page in multiple browser tabs or windows</li>
          <li>Select the same document in both tabs</li>
          <li>Start typing in one tab and watch changes appear in the other</li>
          <li>Try typing simultaneously in both tabs to see conflict resolution</li>
          <li>Go offline in one tab and continue editing - changes will sync when back online</li>
        </ol>
      </div>

      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Features Demonstrated</h3>
        <ul className="list-disc list-inside text-gray-700 space-y-1">
          <li><strong>Real-time Sync:</strong> Changes appear instantly across all connected clients</li>
          <li><strong>Conflict Resolution:</strong> Y.js CRDT automatically merges concurrent edits</li>
          <li><strong>User Presence:</strong> See who's actively editing the document</li>
          <li><strong>Connection Management:</strong> Automatic reconnection with exponential backoff</li>
          <li><strong>Performance Monitoring:</strong> Real-time sync statistics and metrics</li>
          <li><strong>Enhanced Error Recovery:</strong> Robust error handling and retry logic</li>
          <li><strong>Offline Support:</strong> Continue editing offline, sync when reconnected</li>
          <li><strong>Error Handling:</strong> Graceful handling of network issues and sync errors</li>
          <li><strong>Status Indicators:</strong> Visual feedback for sync status and connection state</li>
          <li><strong>Local Persistence:</strong> Documents are saved locally via IndexedDB</li>
        </ul>
      </div>

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-900 mb-2">Development Notes</h3>
        <ul className="list-disc list-inside text-yellow-800 space-y-1">
          <li>Check the browser console for detailed sync logs</li>
          <li>The status indicator shows current sync state (synced, syncing, error, offline)</li>
          <li>Red error messages will appear if sync fails - use the "Retry Sync" button</li>
          <li>Document changes are debounced (500ms) before sending to server</li>
          <li>Y.Doc state is stored as binary data in Convex for efficiency</li>
        </ul>
      </div>
    </div>
  );
};

export default ConvexYjsSyncExample;
