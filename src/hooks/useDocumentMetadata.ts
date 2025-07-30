import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

/**
 * User information for document metadata
 */
export interface DocumentUser {
  _id: Id<"users">;
  name?: string;
  email?: string;
  image?: string;
}

/**
 * Document metadata structure
 */
export interface DocumentMetadata {
  _id: Id<"documents">;
  title: string;
  isPublic: boolean;
  collaborators: DocumentUser[];
  owner: DocumentUser | null;
  createdAt: number;
  updatedAt: number;
  yjsUpdatedAt?: number;
  _creationTime: number;
}

/**
 * Hook return type
 */
export interface UseDocumentMetadataReturn {
  metadata: DocumentMetadata | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Custom hook for subscribing to real-time document metadata changes
 * 
 * This hook provides real-time updates for:
 * - Document title changes
 * - Collaborator additions/removals
 * - Permission changes (public/private)
 * - Owner information
 * - Timestamps and creation info
 * 
 * @param documentId - The ID of the document to subscribe to
 * @param enabled - Whether the subscription should be active (default: true)
 * @returns Object containing metadata, loading state, and error state
 */
export const useDocumentMetadata = (
  documentId: Id<"documents"> | null,
  enabled: boolean = true
): UseDocumentMetadataReturn => {
  // Subscribe to document metadata using Convex useQuery
  const metadata = useQuery(
    api.subscriptions.subscribeToDocumentMetadata,
    documentId && enabled ? { documentId } : "skip"
  );

  // Determine loading state
  const isLoading = enabled && documentId !== null && metadata === undefined;

  // For now, we'll handle errors through Convex's built-in error handling
  // In the future, we could add more sophisticated error handling
  const error = null;

  return {
    metadata: metadata ? {
      ...metadata,
      collaborators: metadata.collaborators.filter(Boolean) as DocumentUser[]
    } : undefined,
    isLoading,
    error,
  };
};

/**
 * Hook for subscribing to multiple documents' metadata
 * Useful for document lists or dashboards
 */
export const useMultipleDocumentMetadata = (
  documentIds: Id<"documents">[],
  enabled: boolean = true
) => {
  // For now, we'll use individual queries
  // In the future, we could optimize this with a batch query
  const metadataQueries = documentIds.map(documentId => 
    useQuery(
      api.subscriptions.subscribeToDocumentMetadata,
      enabled ? { documentId } : "skip"
    )
  );

  const isLoading = enabled && metadataQueries.some(query => query === undefined);
  const allMetadata = metadataQueries.filter(Boolean) as DocumentMetadata[];

  return {
    metadata: allMetadata,
    isLoading,
    error: null,
  };
};

/**
 * Utility function to check if user is a collaborator
 */
export const isUserCollaborator = (
  metadata: DocumentMetadata | undefined,
  userId: Id<"users"> | null
): boolean => {
  if (!metadata || !userId) return false;
  
  return (
    metadata.owner?._id === userId ||
    metadata.collaborators.some(collaborator => collaborator._id === userId)
  );
};

/**
 * Utility function to check if user is the owner
 */
export const isUserOwner = (
  metadata: DocumentMetadata | undefined,
  userId: Id<"users"> | null
): boolean => {
  if (!metadata || !userId) return false;
  return metadata.owner?._id === userId;
};

/**
 * Utility function to get formatted collaborator names
 */
export const getCollaboratorNames = (metadata: DocumentMetadata | undefined): string[] => {
  if (!metadata) return [];
  
  const names: string[] = [];
  
  // Add owner name
  if (metadata.owner?.name) {
    names.push(`${metadata.owner.name} (Owner)`);
  }
  
  // Add collaborator names
  metadata.collaborators.forEach(collaborator => {
    if (collaborator.name && collaborator._id !== metadata.owner?._id) {
      names.push(collaborator.name);
    }
  });
  
  return names;
};

/**
 * Utility function to format last updated time
 */
export const getLastUpdatedText = (metadata: DocumentMetadata | undefined): string => {
  if (!metadata) return 'Never';
  
  const lastUpdate = metadata.yjsUpdatedAt || metadata.updatedAt;
  const now = Date.now();
  const diffMs = now - lastUpdate;
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  
  return new Date(lastUpdate).toLocaleDateString();
};
