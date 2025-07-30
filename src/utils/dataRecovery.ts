import * as Y from 'yjs'

/**
 * Data recovery utilities for Y.js documents stored in IndexedDB
 */

export interface DocumentBackup {
  documentId: string
  timestamp: Date
  data: Uint8Array
  size: number
  version?: string
}

export interface RecoveryOptions {
  /** Maximum age of backups to keep (in days) */
  maxAge?: number
  /** Maximum number of backups per document */
  maxBackups?: number
  /** Whether to compress backup data */
  compress?: boolean
}

/**
 * Export a Y.js document to a backup format
 * 
 * @param yDoc - The Y.js document to export
 * @param documentId - Unique identifier for the document
 * @returns Promise resolving to a DocumentBackup object
 */
export const exportDocument = async (yDoc: Y.Doc, documentId: string): Promise<DocumentBackup> => {
  try {
    // Get the document state as a Uint8Array
    const state = Y.encodeStateAsUpdate(yDoc)
    
    const backup: DocumentBackup = {
      documentId,
      timestamp: new Date(),
      data: state,
      size: state.length,
      version: '1.0'
    }
    
    console.log(`Document exported: ${documentId} (${backup.size} bytes)`)
    return backup
  } catch (error) {
    console.error('Failed to export document:', error)
    throw new Error(`Failed to export document: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Import a document backup into a Y.js document
 * 
 * @param backup - The DocumentBackup to import
 * @param targetDoc - The Y.js document to import into (optional, creates new if not provided)
 * @returns Promise resolving to the Y.js document with imported data
 */
export const importDocument = async (backup: DocumentBackup, targetDoc?: Y.Doc): Promise<Y.Doc> => {
  try {
    const yDoc = targetDoc || new Y.Doc()
    
    // Apply the backup state to the document
    Y.applyUpdate(yDoc, backup.data)
    
    console.log(`Document imported: ${backup.documentId} (${backup.size} bytes)`)
    return yDoc
  } catch (error) {
    console.error('Failed to import document:', error)
    throw new Error(`Failed to import document: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Save a document backup to browser storage
 * 
 * @param backup - The DocumentBackup to save
 * @returns Promise resolving when backup is saved
 */
export const saveBackupToStorage = async (backup: DocumentBackup): Promise<void> => {
  try {
    const backupKey = `aurawrite_backup_${backup.documentId}_${backup.timestamp.getTime()}`
    const backupData = {
      ...backup,
      data: Array.from(backup.data) // Convert Uint8Array to regular array for JSON storage
    }
    
    localStorage.setItem(backupKey, JSON.stringify(backupData))
    console.log(`Backup saved to storage: ${backupKey}`)
  } catch (error) {
    console.error('Failed to save backup to storage:', error)
    throw new Error(`Failed to save backup: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Load document backups from browser storage
 * 
 * @param documentId - Optional document ID to filter backups
 * @returns Promise resolving to array of DocumentBackup objects
 */
export const loadBackupsFromStorage = async (documentId?: string): Promise<DocumentBackup[]> => {
  try {
    const backups: DocumentBackup[] = []
    const prefix = documentId ? `aurawrite_backup_${documentId}_` : 'aurawrite_backup_'
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        try {
          const backupData = JSON.parse(localStorage.getItem(key) || '{}')
          const backup: DocumentBackup = {
            ...backupData,
            timestamp: new Date(backupData.timestamp),
            data: new Uint8Array(backupData.data) // Convert back to Uint8Array
          }
          backups.push(backup)
        } catch (parseError) {
          console.warn(`Failed to parse backup ${key}:`, parseError)
        }
      }
    }
    
    // Sort by timestamp (newest first)
    backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    
    console.log(`Loaded ${backups.length} backups from storage`)
    return backups
  } catch (error) {
    console.error('Failed to load backups from storage:', error)
    return []
  }
}

/**
 * Clean up old backups based on recovery options
 * 
 * @param options - Recovery options for cleanup
 * @returns Promise resolving to number of backups cleaned up
 */
export const cleanupOldBackups = async (options: RecoveryOptions = {}): Promise<number> => {
  const { maxAge = 30, maxBackups = 10 } = options
  
  try {
    const allBackups = await loadBackupsFromStorage()
    const now = Date.now()
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000 // Convert days to milliseconds
    
    let cleanedUp = 0
    
    // Group backups by document ID
    const backupsByDoc = new Map<string, DocumentBackup[]>()
    for (const backup of allBackups) {
      if (!backupsByDoc.has(backup.documentId)) {
        backupsByDoc.set(backup.documentId, [])
      }
      backupsByDoc.get(backup.documentId)!.push(backup)
    }
    
    // Clean up each document's backups
    for (const [, backups] of backupsByDoc) {
      // Sort by timestamp (newest first)
      backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      
      for (let i = 0; i < backups.length; i++) {
        const backup = backups[i]
        const age = now - backup.timestamp.getTime()
        
        // Remove if too old or exceeds max count
        if (age > maxAgeMs || i >= maxBackups) {
          const backupKey = `aurawrite_backup_${backup.documentId}_${backup.timestamp.getTime()}`
          localStorage.removeItem(backupKey)
          cleanedUp++
        }
      }
    }
    
    console.log(`Cleaned up ${cleanedUp} old backups`)
    return cleanedUp
  } catch (error) {
    console.error('Failed to cleanup old backups:', error)
    return 0
  }
}

/**
 * Attempt to recover a corrupted document from IndexedDB
 * 
 * @param documentId - The document ID to recover
 * @returns Promise resolving to recovered Y.Doc or null if recovery failed
 */
export const recoverCorruptedDocument = async (documentId: string): Promise<Y.Doc | null> => {
  try {
    console.log(`Attempting to recover corrupted document: ${documentId}`)
    
    // Try to load from backups first
    const backups = await loadBackupsFromStorage(documentId)
    if (backups.length > 0) {
      console.log(`Found ${backups.length} backups, attempting recovery from latest`)
      const latestBackup = backups[0]
      return await importDocument(latestBackup)
    }
    
    // If no backups, try to create a new document with minimal content
    console.log('No backups found, creating new document with default content')
    const newDoc = new Y.Doc()
    const sharedType = newDoc.get('content', Y.XmlText)
    
    // Add minimal default content
    newDoc.transact(() => {
      sharedType.insert(0, 'Document recovered. Previous content may have been lost.')
    })
    
    return newDoc
  } catch (error) {
    console.error('Failed to recover corrupted document:', error)
    return null
  }
}

/**
 * Create an automatic backup of a document
 * 
 * @param yDoc - The Y.js document to backup
 * @param documentId - The document ID
 * @param options - Recovery options
 * @returns Promise resolving when backup is complete
 */
export const createAutomaticBackup = async (
  yDoc: Y.Doc, 
  documentId: string, 
  options: RecoveryOptions = {}
): Promise<void> => {
  try {
    // Export the document
    const backup = await exportDocument(yDoc, documentId)
    
    // Save to storage
    await saveBackupToStorage(backup)
    
    // Clean up old backups
    await cleanupOldBackups(options)
    
    console.log(`Automatic backup created for document: ${documentId}`)
  } catch (error) {
    console.error('Failed to create automatic backup:', error)
    // Don't throw - backup failures shouldn't break the main application
  }
}
