import React, { useState } from 'react'
import CollaborativeEditor from './CollaborativeEditor'
import { createDocumentId, isValidDocumentId } from '../hooks/useYjsDocument'
import { Descendant } from 'slate'

/**
 * Demo component to showcase Y.Doc initialization and collaborative editing features
 * This component demonstrates:
 * - Y.Doc creation with unique document IDs
 * - Shared type configuration for collaborative text editing
 * - IndexedDB persistence for offline editing
 * - Multiple editor instances sharing the same document
 */
const CollaborativeEditorDemo: React.FC = () => {
  const [documentId, setDocumentId] = useState(() => createDocumentId('demo'))
  const [customDocumentId, setCustomDocumentId] = useState('')
  const [showMultipleEditors, setShowMultipleEditors] = useState(false)
  const [editorContent, setEditorContent] = useState<Descendant[]>([])

  // Handle creating a new document
  const handleNewDocument = () => {
    const newDocId = createDocumentId('demo')
    setDocumentId(newDocId)
    setEditorContent([])
  }

  // Handle switching to a custom document ID
  const handleCustomDocument = () => {
    if (customDocumentId && isValidDocumentId(customDocumentId)) {
      setDocumentId(customDocumentId)
      setEditorContent([])
    } else {
      alert('Please enter a valid document ID (alphanumeric characters, hyphens, and underscores only)')
    }
  }

  // Handle editor content changes
  const handleEditorChange = (value: Descendant[]) => {
    setEditorContent(value)
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Collaborative Editor Demo - Y.Doc Initialization
        </h1>
        
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">
            Y.Doc Features Demonstrated:
          </h2>
          <ul className="list-disc list-inside text-blue-800 space-y-1">
            <li><strong>Y.Doc Initialization:</strong> Each editor creates a Y.Doc instance with unique client ID</li>
            <li><strong>Shared Types:</strong> Using Y.XmlText for Slate.js compatibility</li>
            <li><strong>IndexedDB Persistence:</strong> Documents persist across browser sessions</li>
            <li><strong>Real-time Sync:</strong> Multiple editors can share the same document</li>
            <li><strong>Proper Cleanup:</strong> Y.Doc instances are properly destroyed on unmount</li>
          </ul>
        </div>

        {/* Document Controls */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Document Controls</h3>
          
          <div className="flex flex-wrap gap-4 items-center">
            <button
              onClick={handleNewDocument}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              New Document
            </button>
            
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customDocumentId}
                onChange={(e) => setCustomDocumentId(e.target.value)}
                placeholder="Enter custom document ID"
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCustomDocument}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Load Document
              </button>
            </div>
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showMultipleEditors}
                onChange={(e) => setShowMultipleEditors(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-700">Show Multiple Editors</span>
            </label>
          </div>
        </div>

        {/* Primary Editor */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Primary Editor
          </h3>
          <CollaborativeEditor
            documentId={documentId}
            placeholder="Start typing to see Y.Doc in action..."
            onChange={handleEditorChange}
            className="w-full"
          />
        </div>

        {/* Secondary Editor (for testing collaboration) */}
        {showMultipleEditors && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Secondary Editor (Same Document)
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              This editor shares the same Y.Doc instance. Changes made in one editor 
              will appear in the other, demonstrating collaborative editing.
            </p>
            <CollaborativeEditor
              documentId={documentId}
              placeholder="This editor shares the same document..."
              className="w-full border-2 border-green-200"
            />
          </div>
        )}

        {/* Content Preview */}
        {editorContent.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Current Content (Slate.js Format)
            </h3>
            <pre className="text-sm text-gray-700 bg-white p-3 rounded border overflow-auto max-h-40">
              {JSON.stringify(editorContent, null, 2)}
            </pre>
          </div>
        )}

        {/* Technical Information */}
        <div className="p-4 bg-yellow-50 rounded-lg">
          <h3 className="text-lg font-semibold text-yellow-900 mb-3">
            Technical Implementation Notes
          </h3>
          <div className="text-yellow-800 space-y-2 text-sm">
            <p>
              <strong>Y.Doc Creation:</strong> Each CollaborativeEditor component creates a Y.Doc 
              instance using the useYjsDocument hook, which handles initialization and cleanup.
            </p>
            <p>
              <strong>Shared Types:</strong> We use Y.XmlText (not Y.Text) for Slate.js compatibility, 
              as recommended by the slate-yjs documentation.
            </p>
            <p>
              <strong>IndexedDB Persistence:</strong> Documents are automatically persisted to IndexedDB 
              using y-indexeddb, enabling offline editing and data persistence across sessions.
            </p>
            <p>
              <strong>Normalization:</strong> The editor includes normalization rules to ensure it 
              always has valid children, preventing crashes during collaborative editing.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CollaborativeEditorDemo
