import React, { useState, useEffect } from 'react';
import { SyncStats } from '../hooks/useOptimizedSync';

/**
 * Props for the SyncPerformanceMonitor component
 */
interface SyncPerformanceMonitorProps {
  /** Function to get current sync statistics */
  getStats: () => SyncStats;
  /** Function to clear statistics */
  clearStats: () => void;
  /** Whether the monitor is visible */
  visible?: boolean;
  /** CSS class name */
  className?: string;
  /** Update interval in milliseconds */
  updateInterval?: number;
}

/**
 * Performance monitoring component for real-time sync
 * 
 * Displays:
 * - Update statistics
 * - Latency metrics
 * - Compression ratios
 * - Error rates
 * - Real-time performance graphs
 */
export const SyncPerformanceMonitor: React.FC<SyncPerformanceMonitorProps> = ({
  getStats,
  clearStats,
  visible = false,
  className = '',
  updateInterval = 1000,
}) => {
  const [stats, setStats] = useState<SyncStats>({
    totalUpdates: 0,
    batchedUpdates: 0,
    failedUpdates: 0,
    averageLatency: 0,
    compressionRatio: 1,
    lastSyncTime: 0,
  });

  const [isExpanded, setIsExpanded] = useState(false);

  // Update stats periodically
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      setStats(getStats());
    }, updateInterval);

    return () => clearInterval(interval);
  }, [visible, getStats, updateInterval]);

  if (!visible) return null;

  const successRate = stats.totalUpdates > 0 
    ? ((stats.totalUpdates - stats.failedUpdates) / stats.totalUpdates * 100).toFixed(1)
    : '100.0';

  const batchEfficiency = stats.totalUpdates > 0
    ? (stats.batchedUpdates / stats.totalUpdates * 100).toFixed(1)
    : '0.0';

  const timeSinceLastSync = stats.lastSyncTime > 0
    ? Math.floor((Date.now() - stats.lastSyncTime) / 1000)
    : 0;

  return (
    <div className={`bg-gray-900 text-white text-xs font-mono ${className}`}>
      {/* Compact View */}
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-800"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${
              stats.failedUpdates === 0 ? 'bg-green-400' : 
              stats.failedUpdates < 3 ? 'bg-yellow-400' : 'bg-red-400'
            }`} />
            <span>Sync</span>
          </div>
          
          <div>
            {stats.averageLatency.toFixed(0)}ms
          </div>
          
          <div>
            {stats.totalUpdates} updates
          </div>
          
          <div>
            {successRate}% success
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearStats();
            }}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
          >
            Clear
          </button>
          
          <svg 
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="border-t border-gray-700 p-3 space-y-3">
          {/* Statistics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-gray-400 uppercase text-xs">Updates</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span className="text-blue-400">{stats.totalUpdates}</span>
                </div>
                <div className="flex justify-between">
                  <span>Batched:</span>
                  <span className="text-green-400">{stats.batchedUpdates}</span>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <span className="text-red-400">{stats.failedUpdates}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-gray-400 uppercase text-xs">Performance</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Latency:</span>
                  <span className="text-yellow-400">{stats.averageLatency.toFixed(0)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Compression:</span>
                  <span className="text-purple-400">{(stats.compressionRatio * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Last sync:</span>
                  <span className="text-gray-400">{timeSinceLastSync}s ago</span>
                </div>
              </div>
            </div>
          </div>

          {/* Efficiency Metrics */}
          <div className="space-y-2">
            <h4 className="text-gray-400 uppercase text-xs">Efficiency</h4>
            
            <div className="space-y-2">
              <div>
                <div className="flex justify-between mb-1">
                  <span>Success Rate</span>
                  <span>{successRate}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${successRate}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>Batch Efficiency</span>
                  <span>{batchEfficiency}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${batchEfficiency}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Performance Indicators */}
          <div className="space-y-2">
            <h4 className="text-gray-400 uppercase text-xs">Status</h4>
            
            <div className="flex flex-wrap gap-2">
              <div className={`px-2 py-1 rounded text-xs ${
                stats.averageLatency < 100 ? 'bg-green-900 text-green-300' :
                stats.averageLatency < 500 ? 'bg-yellow-900 text-yellow-300' :
                'bg-red-900 text-red-300'
              }`}>
                {stats.averageLatency < 100 ? 'Low Latency' :
                 stats.averageLatency < 500 ? 'Medium Latency' : 'High Latency'}
              </div>

              <div className={`px-2 py-1 rounded text-xs ${
                stats.compressionRatio > 0.8 ? 'bg-green-900 text-green-300' :
                stats.compressionRatio > 0.5 ? 'bg-yellow-900 text-yellow-300' :
                'bg-red-900 text-red-300'
              }`}>
                {stats.compressionRatio > 0.8 ? 'Good Compression' :
                 stats.compressionRatio > 0.5 ? 'Fair Compression' : 'Poor Compression'}
              </div>

              <div className={`px-2 py-1 rounded text-xs ${
                parseFloat(successRate) > 95 ? 'bg-green-900 text-green-300' :
                parseFloat(successRate) > 80 ? 'bg-yellow-900 text-yellow-300' :
                'bg-red-900 text-red-300'
              }`}>
                {parseFloat(successRate) > 95 ? 'Excellent' :
                 parseFloat(successRate) > 80 ? 'Good' : 'Poor'} Reliability
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex space-x-2 pt-2 border-t border-gray-700">
            <button
              onClick={clearStats}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
            >
              Reset Stats
            </button>
            
            <button
              onClick={() => {
                const data = JSON.stringify(stats, null, 2);
                navigator.clipboard.writeText(data);
              }}
              className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs"
            >
              Copy Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Compact performance indicator for status bars
 */
interface CompactPerformanceIndicatorProps {
  getStats: () => SyncStats;
  className?: string;
}

export const CompactPerformanceIndicator: React.FC<CompactPerformanceIndicatorProps> = ({
  getStats,
  className = '',
}) => {
  const [stats, setStats] = useState<SyncStats>({
    totalUpdates: 0,
    batchedUpdates: 0,
    failedUpdates: 0,
    averageLatency: 0,
    compressionRatio: 1,
    lastSyncTime: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getStats());
    }, 2000);

    return () => clearInterval(interval);
  }, [getStats]);

  const getLatencyColor = (latency: number) => {
    if (latency < 100) return 'text-green-500';
    if (latency < 500) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStatusIcon = () => {
    if (stats.failedUpdates === 0) return '🟢';
    if (stats.failedUpdates < 3) return '🟡';
    return '🔴';
  };

  return (
    <div className={`flex items-center space-x-2 text-xs ${className}`}>
      <span>{getStatusIcon()}</span>
      <span className={getLatencyColor(stats.averageLatency)}>
        {stats.averageLatency.toFixed(0)}ms
      </span>
      <span className="text-gray-500">
        {stats.totalUpdates} updates
      </span>
    </div>
  );
};
