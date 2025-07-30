import { useMemo, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { slateNodesToInsertDelta } from '@slate-yjs/core'
import { Descendant } from 'slate'

/**
 * Configuration options for the Yjs document hook
 */
interface UseYjsDocumentOptions {
  /** Unique identifier for the document */
  documentId: string
  /** Initial content to load if the document is empty */
  initialValue?: Descendant[]
  /** Whether to enable IndexedDB persistence */
  enablePersistence?: boolean
  /** Whether to enable garbage collection (default: true) */
  enableGarbageCollection?: boolean
}

/**
 * Return type for the useYjsDocument hook
 */
interface UseYjsDocumentReturn {
  /** The Y.Doc instance */
  yDoc: Y.Doc
  /** The shared text type for collaborative editing */
  sharedType: Y.XmlText
  /** IndexedDB persistence provider (if enabled) */
  indexeddbProvider?: IndexeddbPersistence
  /** Whether the document is synced with IndexedDB */
  isSynced: boolean
}

/**
 * Custom hook to manage Y.Doc lifecycle and shared types
 * 
 * This hook handles:
 * - Y.Doc creation and cleanup
 * - Shared type initialization
 * - IndexedDB persistence setup
 * - Initial content loading
 * - Proper cleanup on unmount
 * 
 * @param options Configuration options for the document
 * @returns Object containing Y.Doc, shared type, and persistence provider
 */
export const useYjsDocument = (options: UseYjsDocumentOptions): UseYjsDocumentReturn => {
  const {
    documentId,
    initialValue = [{ type: 'paragraph', children: [{ text: '' }] }],
    enablePersistence = true,
    enableGarbageCollection = true
  } = options

  // Track sync status
  const isSyncedRef = useRef(false)
  const [isSynced, setIsSynced] = useState(false)

  // Create Y.Doc and shared types
  const { yDoc, sharedType, indexeddbProvider } = useMemo(() => {
    console.log(`Initializing Y.Doc for document: ${documentId}`)
    
    // Create a new Y.Doc instance
    const yDoc = new Y.Doc()
    
    // Configure garbage collection
    yDoc.gc = enableGarbageCollection
    
    // Get the shared type for text content
    // Using Y.XmlText for Slate.js compatibility (not Y.Text)
    const sharedType = yDoc.get('content', Y.XmlText)
    
    // Set up IndexedDB persistence if enabled
    let indexeddbProvider: IndexeddbPersistence | undefined
    if (enablePersistence) {
      indexeddbProvider = new IndexeddbPersistence(documentId, yDoc)
      
      // Handle sync events
      indexeddbProvider.whenSynced.then(() => {
        console.log(`Y.Doc synced with IndexedDB for document: ${documentId}`)
        isSyncedRef.current = true
        setIsSynced(true)
        
        // Load initial value if the document is empty after sync
        if (sharedType.length === 0 && initialValue.length > 0) {
          console.log('Loading initial value into empty Y.Doc')
          yDoc.transact(() => {
            sharedType.applyDelta(slateNodesToInsertDelta(initialValue))
          })
        }
      })
    } else {
      // If persistence is disabled, load initial value immediately
      if (sharedType.length === 0 && initialValue.length > 0) {
        console.log('Loading initial value into Y.Doc (no persistence)')
        yDoc.transact(() => {
          sharedType.applyDelta(slateNodesToInsertDelta(initialValue))
        })
      }
      setIsSynced(true)
    }
    
    return { yDoc, sharedType, indexeddbProvider }
  }, [documentId, enablePersistence, enableGarbageCollection])

  // Set up event listeners and cleanup
  useEffect(() => {
    const handleUpdate = (update: Uint8Array, origin: any) => {
      console.log('Y.Doc update received:', { 
        updateSize: update.length, 
        origin: origin?.constructor?.name || origin,
        clientId: yDoc.clientID 
      })
    }

    const handleAfterTransaction = (transaction: Y.Transaction) => {
      if (transaction.changed.size > 0) {
        console.log('Y.Doc transaction completed:', {
          changedTypes: Array.from(transaction.changed.keys()).map(type => type.constructor.name),
          origin: transaction.origin?.constructor?.name || transaction.origin
        })
      }
    }

    // Add event listeners for debugging and monitoring
    yDoc.on('update', handleUpdate)
    yDoc.on('afterTransaction', handleAfterTransaction)

    // Cleanup function
    return () => {
      console.log(`Cleaning up Y.Doc for document: ${documentId}`)
      
      // Remove event listeners
      yDoc.off('update', handleUpdate)
      yDoc.off('afterTransaction', handleAfterTransaction)
      
      // Clean up IndexedDB provider
      if (indexeddbProvider) {
        indexeddbProvider.destroy()
      }
      
      // Destroy the Y.Doc instance
      // Note: Only destroy if this is the last reference to the document
      // In a real application, you might want to implement reference counting
      yDoc.destroy()
    }
  }, [yDoc, indexeddbProvider, documentId])

  return {
    yDoc,
    sharedType,
    indexeddbProvider,
    isSynced
  }
}

/**
 * Utility function to create a unique document ID
 * @param prefix Optional prefix for the document ID
 * @returns A unique document identifier
 */
export const createDocumentId = (prefix = 'doc'): string => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${timestamp}-${random}`
}

/**
 * Utility function to validate document ID format
 * @param documentId The document ID to validate
 * @returns Whether the document ID is valid
 */
export const isValidDocumentId = (documentId: string): boolean => {
  // Document ID should be non-empty and contain only safe characters
  return /^[a-zA-Z0-9_-]+$/.test(documentId) && documentId.length > 0 && documentId.length <= 100
}
