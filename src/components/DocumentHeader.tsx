import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useDocumentMetadata, getCollaboratorNames, getLastUpdatedText } from '../hooks/useDocumentMetadata';

/**
 * Props for the DocumentHeader component
 */
interface DocumentHeaderProps {
  documentId: Id<"documents">;
  className?: string;
  showCollaborators?: boolean;
  showLastUpdated?: boolean;
  editable?: boolean;
}

/**
 * Real-time document header component
 * 
 * Displays and allows editing of:
 * - Document title (with real-time updates)
 * - Collaborator list (with real-time updates)
 * - Last updated timestamp (with real-time updates)
 * - Public/private status
 */
export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  documentId,
  className = '',
  showCollaborators = true,
  showLastUpdated = true,
  editable = true,
}) => {
  // Subscribe to real-time document metadata
  const { metadata, isLoading, error } = useDocumentMetadata(documentId);
  
  // Convex mutations
  const updateDocument = useMutation(api.documents.updateDocument);
  
  // Local state for editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Handle title editing
  const handleTitleClick = () => {
    if (!editable || !metadata) return;
    setTitleValue(metadata.title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = async () => {
    if (!metadata || titleValue.trim() === metadata.title) {
      setIsEditingTitle(false);
      return;
    }

    try {
      setIsSaving(true);
      await updateDocument({
        documentId,
        title: titleValue.trim(),
      });
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to update document title:', error);
      // Reset to original title on error
      setTitleValue(metadata.title);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTitleCancel = () => {
    if (metadata) {
      setTitleValue(metadata.title);
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-8 bg-gray-200 rounded-md w-64 mb-2"></div>
        {showCollaborators && (
          <div className="h-4 bg-gray-200 rounded-md w-32 mb-1"></div>
        )}
        {showLastUpdated && (
          <div className="h-4 bg-gray-200 rounded-md w-24"></div>
        )}
      </div>
    );
  }

  // Error state
  if (error || !metadata) {
    return (
      <div className={`text-red-600 ${className}`}>
        <div className="text-lg font-semibold">Error loading document</div>
        <div className="text-sm">Unable to load document information</div>
      </div>
    );
  }

  const collaboratorNames = getCollaboratorNames(metadata);
  const lastUpdatedText = getLastUpdatedText(metadata);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Document Title */}
      <div className="flex items-center space-x-2">
        {isEditingTitle ? (
          <div className="flex items-center space-x-2 flex-1">
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="text-2xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none flex-1"
              autoFocus
              disabled={isSaving}
            />
            {isSaving && (
              <div className="text-sm text-gray-500">Saving...</div>
            )}
          </div>
        ) : (
          <h1
            className={`text-2xl font-bold ${
              editable ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''
            } flex-1`}
            onClick={handleTitleClick}
            title={editable ? 'Click to edit title' : undefined}
          >
            {metadata.title}
          </h1>
        )}
        
        {/* Public/Private Indicator */}
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
          metadata.isPublic 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          {metadata.isPublic ? 'Public' : 'Private'}
        </div>
      </div>

      {/* Document Info */}
      <div className="flex items-center space-x-4 text-sm text-gray-600">
        {/* Collaborators */}
        {showCollaborators && collaboratorNames.length > 0 && (
          <div className="flex items-center space-x-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
            <span>
              {collaboratorNames.length === 1 
                ? collaboratorNames[0]
                : `${collaboratorNames.length} collaborators`
              }
            </span>
          </div>
        )}

        {/* Last Updated */}
        {showLastUpdated && (
          <div className="flex items-center space-x-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Updated {lastUpdatedText}</span>
          </div>
        )}
      </div>

      {/* Collaborator Details (expandable) */}
      {showCollaborators && collaboratorNames.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
            View all collaborators
          </summary>
          <div className="mt-2 pl-4 space-y-1">
            {collaboratorNames.map((name) => (
              <div key={name} className="text-gray-600">
                {name}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
