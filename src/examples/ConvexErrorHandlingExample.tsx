/**
 * Example component demonstrating proper Convex error handling
 * 
 * This example shows:
 * 1. How to use ConvexErrorBoundary with useDocumentMetadata
 * 2. How to handle mutation errors properly
 * 3. How to handle action errors properly
 * 4. Different error boundary configurations
 */

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useDocumentMetadata, useMultipleDocumentMetadata } from '../hooks/useDocumentMetadata';
import { ConvexErrorBoundary, withConvexErrorBoundary } from '../components/ConvexErrorBoundary';
import { DocumentHeader } from '../components/DocumentHeader';

/**
 * Component that uses useDocumentMetadata - wrapped with error boundary
 */
const DocumentMetadataDisplay: React.FC<{ documentId: Id<"documents"> }> = ({ documentId }) => {
  // This will throw errors that are caught by ConvexErrorBoundary
  const { metadata, isLoading } = useDocumentMetadata(documentId);

  if (isLoading) {
    return <div className="animate-pulse bg-gray-200 h-20 rounded"></div>;
  }

  if (!metadata) {
    return <div className="text-gray-500">No document found</div>;
  }

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold">{metadata.title}</h3>
      <p className="text-sm text-gray-600">
        Owner: {metadata.owner?.name || 'Unknown'}
      </p>
      <p className="text-sm text-gray-600">
        Collaborators: {metadata.collaborators.length}
      </p>
      <p className="text-sm text-gray-600">
        Status: {metadata.isPublic ? 'Public' : 'Private'}
      </p>
    </div>
  );
};

/**
 * Component that uses useMultipleDocumentMetadata - wrapped with error boundary
 */
const DocumentListDisplay: React.FC<{ documentIds: Id<"documents">[] }> = ({ documentIds }) => {
  // This will throw errors that are caught by ConvexErrorBoundary
  const { metadata, isLoading } = useMultipleDocumentMetadata(documentIds);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {documentIds.map((_, index) => (
          <div key={index} className="animate-pulse bg-gray-200 h-16 rounded"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {metadata.map((doc) => (
        <div key={doc._id} className="p-3 border rounded">
          <h4 className="font-medium">{doc.title}</h4>
          <p className="text-sm text-gray-600">
            {doc.collaborators.length} collaborators
          </p>
        </div>
      ))}
    </div>
  );
};

/**
 * Component demonstrating mutation error handling
 */
const MutationExample: React.FC<{ documentId: Id<"documents"> }> = ({ documentId }) => {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const updateDocument = useMutation(api.documents.updateDocument);

  const handleUpdateTitle = async () => {
    if (!title.trim()) return;

    setIsUpdating(true);
    setError(null);

    try {
      await updateDocument({
        documentId,
        title: title.trim(),
      });
      setTitle('');
      console.log('Document updated successfully');
    } catch (error) {
      // Mutation errors are caught here, not by error boundaries
      console.error('Failed to update document:', error);
      setError(error instanceof Error ? error.message : 'Failed to update document');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Update Document Title</h3>
      
      <div className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter new title"
          className="w-full p-2 border rounded"
          disabled={isUpdating}
        />
        
        <button
          onClick={handleUpdateTitle}
          disabled={isUpdating || !title.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isUpdating ? 'Updating...' : 'Update Title'}
        </button>
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Component demonstrating action error handling
 */
const ActionExample: React.FC<{ documentId: Id<"documents"> }> = ({ documentId }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);

  // Note: This is a mock action for demonstration purposes
  // In a real application, you would implement an email sending action
  const sendInvitation = async ({ documentId, email }: { documentId: Id<"documents">, email: string }) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate random failures for demonstration
    if (Math.random() < 0.3) {
      throw new Error(`Failed to send invitation to ${email}. Please try again.`);
    }

    console.log(`Mock: Invitation sent to ${email} for document ${documentId}`);
    return { success: true };
  };

  const handleSendInvite = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
  
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSending(true);
    setError(null);
    setSuccess(false);

    try {
      await sendInvitation({
        documentId,
        email: trimmedEmail,
      });
      setEmail('');
      setSuccess(true);
      console.log('Invitation sent successfully');
    } catch (error) {
      // Action errors are caught here, not by error boundaries
      console.error('Failed to send invitation:', error);
      setError(error instanceof Error ? error.message : 'Failed to send invitation');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Send Collaboration Invite</h3>
      
      <div className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter email address"
          className="w-full p-2 border rounded"
          disabled={isSending}
        />
        
        <button
          onClick={handleSendInvite}
          disabled={isSending || !email.trim()}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {isSending ? 'Sending...' : 'Send Invite'}
        </button>
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}
        
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700">
            <strong>Success:</strong> Invitation sent successfully!
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Component using HOC for error boundary
 */
const DocumentHeaderWithErrorBoundary = withConvexErrorBoundary(DocumentHeader, {
  componentName: 'DocumentHeader',
  showErrorDetails: process.env.NODE_ENV === 'development',
});

/**
 * Main example component
 */
export const ConvexErrorHandlingExample: React.FC = () => {
  // Example IDs for demonstration - in production these would be real document IDs
  const [documentId] = useState<Id<"documents">>('example-doc-id' as Id<"documents">);
  const [documentIds] = useState<Id<"documents">[]>([
    'doc-1' as Id<"documents">,
    'doc-2' as Id<"documents">,
    'doc-3' as Id<"documents">,
  ]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Convex Error Handling Examples</h1>
        <p className="text-gray-600 mb-8">
          This page demonstrates proper error handling patterns for Convex queries, mutations, and actions.
        </p>
      </div>

      {/* Query Error Handling with Error Boundary */}
      <section>
        <h2 className="text-xl font-semibold mb-4">1. Query Error Handling (Error Boundaries)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Single document metadata with error boundary */}
          <ConvexErrorBoundary
            componentName="DocumentMetadata"
            showErrorDetails={true}
          >
            <DocumentMetadataDisplay documentId={documentId} />
          </ConvexErrorBoundary>

          {/* Multiple documents metadata with error boundary */}
          <ConvexErrorBoundary
            componentName="DocumentList"
            fallback={(_error, _errorInfo, retry) => (
              <div className="p-4 bg-red-50 border border-red-200 rounded">
                <h3 className="text-red-800 font-semibold">Failed to load documents</h3>
                <p className="text-red-600 text-sm mt-1">
                  Unable to load the document list. Please try again.
                </p>
                <button
                  onClick={retry}
                  className="mt-3 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            )}
          >
            <DocumentListDisplay documentIds={documentIds} />
          </ConvexErrorBoundary>
        </div>
      </section>

      {/* Document Header with HOC */}
      <section>
        <h2 className="text-xl font-semibold mb-4">2. HOC Error Boundary Example</h2>
        <DocumentHeaderWithErrorBoundary
          documentId={documentId}
          className="border rounded-lg p-4"
        />
      </section>

      {/* Mutation Error Handling */}
      <section>
        <h2 className="text-xl font-semibold mb-4">3. Mutation Error Handling (Try/Catch)</h2>
        <MutationExample documentId={documentId} />
      </section>

      {/* Action Error Handling */}
      <section>
        <h2 className="text-xl font-semibold mb-4">4. Action Error Handling (Try/Catch)</h2>
        <ActionExample documentId={documentId} />
      </section>

      {/* Error Handling Guidelines */}
      <section>
        <h2 className="text-xl font-semibold mb-4">5. Error Handling Guidelines</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-800 mb-3">Key Points:</h3>
          <ul className="space-y-2 text-blue-700">
            <li>• <strong>Queries:</strong> Use Error Boundaries - errors are thrown during rendering</li>
            <li>• <strong>Mutations:</strong> Use try/catch or .catch() - errors are promise rejections</li>
            <li>• <strong>Actions:</strong> Use try/catch or .catch() - errors are promise rejections</li>
            <li>• <strong>Error Boundaries:</strong> Wrap components that use useQuery hooks</li>
            <li>• <strong>Granular Control:</strong> Use component-level error boundaries for specific handling</li>
          </ul>
        </div>
      </section>
    </div>
  );
};
