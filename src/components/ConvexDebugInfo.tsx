import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

/**
 * Debug component to show Convex connection status and data
 */
export const ConvexDebugInfo: React.FC = () => {
  const userDocuments = useQuery(api.documents.getUserDocuments);

  return (
    <div className="mb-6 p-4 bg-gray-100 rounded-lg">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Convex Debug Info
      </h3>
      
      <div className="space-y-2 text-sm">
        <div>
          <strong>User Documents Query Status:</strong>{' '}
          {userDocuments === undefined ? (
            <span className="text-yellow-600">Loading...</span>
          ) : userDocuments === null ? (
            <span className="text-red-600">Error or No Access</span>
          ) : (
            <span className="text-green-600">Loaded ({userDocuments.length} documents)</span>
          )}
        </div>
        
        {userDocuments && userDocuments.length > 0 && (
          <div>
            <strong>Documents:</strong>
            <ul className="mt-1 ml-4 list-disc">
              {userDocuments.map((doc) => (
                <li key={doc._id} className="text-xs">
                  <code>{doc._id}</code> - {doc.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {userDocuments && userDocuments.length === 0 && (
          <div className="text-orange-600">
            No documents found. This might indicate an issue with document creation.
          </div>
        )}
      </div>
    </div>
  );
};

export default ConvexDebugInfo;
