import React, { useState } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { usePresence } from '../hooks/usePresence';
import { useDocumentMetadata } from '../hooks/useDocumentMetadata';
import { PresenceList, PresenceIndicator } from './PresenceIndicator';
import { ConnectionStatus } from './ConnectionStatus';
import { SyncPerformanceMonitor } from './SyncPerformanceMonitor';
import { ConnectionState } from '../hooks/useConnectionManager';
import { SyncStats } from '../hooks/useOptimizedSync';

/**
 * Tab types for the collaboration dashboard
 */
const TabType = {
  PRESENCE: 'presence',
  CONNECTION: 'connection',
  PERFORMANCE: 'performance'
} as const;

type TabType = typeof TabType[keyof typeof TabType];

/**
 * Props for the CollaborationDashboard component
 */
interface CollaborationDashboardProps {
  documentId: Id<"documents">;
  connectionState: ConnectionState;
  isSyncing?: boolean;
  syncError?: string | null;
  onReconnect?: () => void;
  getStats?: () => SyncStats;
  clearStats?: () => void;
  className?: string;
  defaultExpanded?: boolean;
}

/**
 * Comprehensive collaboration dashboard component
 * 
 * Displays:
 * - Real-time user presence
 * - Document metadata
 * - Connection status
 * - Performance metrics
 * - Collaboration statistics
 */
export const CollaborationDashboard: React.FC<CollaborationDashboardProps> = ({
  documentId,
  connectionState,
  isSyncing = false,
  syncError,
  onReconnect,
  getStats,
  clearStats,
  className = '',
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<TabType>(TabType.PRESENCE);

  // Hooks
  const { presence } = usePresence(documentId);
  // Note: Errors are now handled by ConvexErrorBoundary wrapping this component
  const { metadata } = useDocumentMetadata(documentId);

  const totalUsers = presence?.totalActiveUsers || 0;
  const isConnected = connectionState === ConnectionState.CONNECTED;

  return (
    <div className={`bg-white border rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 border-b cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-sm font-medium text-gray-900">Collaboration</h3>
          </div>

          {/* Quick indicators */}
          <div className="flex items-center space-x-4">
            <PresenceIndicator 
              documentId={documentId}
              size="sm"
              maxVisible={3}
              showNames={false}
            />
            
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`} />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">
            {totalUsers} active
          </span>
          
          <svg 
            className={`w-4 h-4 text-gray-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3">
          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-4 bg-gray-100 rounded-lg p-1">
            {[
              { id: 'presence', label: 'Users', icon: '👥' },
              { id: 'connection', label: 'Connection', icon: '🔗' },
              { id: 'performance', label: 'Performance', icon: '📊' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex-1 flex items-center justify-center space-x-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[200px]">
            {activeTab === 'presence' && (
              <div className="space-y-4">
                {/* Document Info */}
                {metadata && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Document</h4>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div>Title: {metadata.title}</div>
                      <div>Owner: {metadata.owner?.name || 'Unknown'}</div>
                      <div>Collaborators: {metadata.collaborators.length}</div>
                      <div>
                        Status: {metadata.isPublic ? 'Public' : 'Private'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Active Users */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Active Users</h4>
                  <PresenceList documentId={documentId} />
                </div>

                {/* Collaboration Stats */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Statistics</h4>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-gray-600">Active Now</div>
                      <div className="text-lg font-semibold text-blue-600">{totalUsers}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Collaborators</div>
                      <div className="text-lg font-semibold text-green-600">
                        {metadata?.collaborators.length || 0}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'connection' && (
              <div className="space-y-4">
                <ConnectionStatus
                  connectionState={connectionState}
                  isSyncing={isSyncing}
                  error={syncError}
                  onReconnect={onReconnect}
                  showDetails={true}
                  size="md"
                />

                {/* Connection History */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Connection Info</h4>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className={`font-medium ${
                        isConnected ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {connectionState}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Syncing:</span>
                      <span className={`font-medium ${
                        isSyncing ? 'text-blue-600' : 'text-gray-600'
                      }`}>
                        {isSyncing ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {syncError && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
                        {syncError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-4">
                {getStats && clearStats ? (
                  <SyncPerformanceMonitor
                    getStats={getStats}
                    clearStats={clearStats}
                    visible={true}
                    updateInterval={2000}
                  />
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm">Performance monitoring not available</p>
                    <p className="text-xs text-gray-400">Enable optimized sync to view metrics</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Floating collaboration panel
 */
interface FloatingCollaborationPanelProps {
  documentId: Id<"documents">;
  connectionState: ConnectionState;
  isSyncing?: boolean;
  syncError?: string | null;
  onReconnect?: () => void;
  getStats?: () => SyncStats;
  clearStats?: () => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const FloatingCollaborationPanel: React.FC<FloatingCollaborationPanelProps> = ({
  documentId,
  connectionState,
  isSyncing,
  syncError,
  onReconnect,
  getStats,
  clearStats,
  position = 'top-right',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors"
        title="Collaboration Dashboard"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      {/* Panel */}
      {isVisible && (
        <div className="absolute top-full mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto">
          <CollaborationDashboard
            documentId={documentId}
            connectionState={connectionState}
            isSyncing={isSyncing}
            syncError={syncError}
            onReconnect={onReconnect}
            getStats={getStats}
            clearStats={clearStats}
            defaultExpanded={true}
          />
        </div>
      )}
    </div>
  );
};
