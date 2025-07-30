import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { createEditor, Descendant, BaseEditor, Editor, Transforms } from 'slate'
import { Slate, Editable, withReact, ReactEditor, RenderElementProps, RenderLeafProps } from 'slate-react'
import { withYjs, YjsEditor } from '@slate-yjs/core'
import { useYjsDocument } from '../hooks/useYjsDocument'

// TypeScript type definitions for Slate
type CustomElement = { type: 'paragraph'; children: CustomText[] }
type CustomText = { text: string; bold?: boolean; italic?: boolean }

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor
    Element: CustomElement
    Text: CustomText
  }
}

// Initial value for the editor
const initialValue: Descendant[] = [
  {
    type: 'paragraph',
    children: [{ text: 'Start typing your collaborative document here...' }],
  },
]

// Element component for rendering different node types
const Element = ({ attributes, children, element }: RenderElementProps) => {
  switch (element.type) {
    case 'paragraph':
      return <p {...attributes}>{children}</p>
    default:
      return <div {...attributes}>{children}</div>
  }
}

// Leaf component for rendering text with formatting
const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  if (leaf.bold) {
    children = <strong>{children}</strong>
  }

  if (leaf.italic) {
    children = <em>{children}</em>
  }

  return <span {...attributes}>{children}</span>
}

// Props interface for the CollaborativeEditor component
interface CollaborativeEditorProps {
  className?: string
  placeholder?: string
  documentId?: string
  onChange?: (value: Descendant[]) => void
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  className = '',
  placeholder = 'Start typing...',
  documentId = 'default-document',
  onChange
}) => {
  // Initialize Y.Doc and shared types using the custom hook
  const { yDoc, sharedType, indexeddbProvider, isSynced } = useYjsDocument({
    documentId,
    initialValue,
    enablePersistence: true,
    enableGarbageCollection: true
  })

  // Create Slate editor with Yjs integration
  const editor = useMemo(() => {
    // Create the base editor with React integration and Yjs binding
    const e = withYjs(withReact(createEditor()), sharedType)
    
    // Add normalization to ensure editor always has at least 1 valid child
    // This prevents crashes when collaborative changes result in an empty editor
    const { normalizeNode } = e
    e.normalizeNode = (entry) => {
      const [node] = entry
      
      // If this is the editor node and it has no children, add a default paragraph
      if (Editor.isEditor(node) && node.children.length === 0) {
        Transforms.insertNodes(
          e,
          {
            type: 'paragraph',
            children: [{ text: '' }],
          },
          { at: [0] }
        )
        return
      }
      
      // Otherwise, use the default normalization
      return normalizeNode(entry)
    }
    
    return e
  }, [sharedType])

  // Manage editor value state
  const [value, setValue] = useState<Descendant[]>([])

  // Connect/disconnect the Yjs editor
  useEffect(() => {
    // Connect the editor to start synchronizing with the shared type
    YjsEditor.connect(editor)

    // Wait for IndexedDB to sync if persistence is enabled
    if (indexeddbProvider) {
      indexeddbProvider.whenSynced.then(() => {
        console.log('Y.Doc synced with IndexedDB')
      })
    }

    // Cleanup function to disconnect the editor
    return () => {
      YjsEditor.disconnect(editor)
      // Note: Y.Doc cleanup is handled by the useYjsDocument hook
    }
  }, [editor, indexeddbProvider])

  // Render element callback
  const renderElement = useCallback((props: RenderElementProps) => <Element {...props} />, [])

  // Render leaf callback
  const renderLeaf = useCallback((props: RenderLeafProps) => <Leaf {...props} />, [])

  // Handle editor value changes
  const handleChange = (newValue: Descendant[]) => {
    setValue(newValue)
    onChange?.(newValue)
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!event.ctrlKey) {
      return
    }

    switch (event.key) {
      case 'b': {
        event.preventDefault()
        const marks = Editor.marks(editor)
        const isActive = marks ? marks.bold === true : false
        if (isActive) {
          Editor.removeMark(editor, 'bold')
        } else {
          Editor.addMark(editor, 'bold', true)
        }
        break
      }
      case 'i': {
        event.preventDefault()
        const marks = Editor.marks(editor)
        const isActive = marks ? marks.italic === true : false
        if (isActive) {
          Editor.removeMark(editor, 'italic')
        } else {
          Editor.addMark(editor, 'italic', true)
        }
        break
      }
    }
  }

  return (
    <div className={`collaborative-editor ${className}`}>
      <Slate
        editor={editor}
        value={value}
        onChange={handleChange}
      >
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          className="min-h-[200px] p-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          spellCheck
          autoFocus
        />
      </Slate>
      
      {/* Debug information - remove in production */}
      <div className="mt-2 text-xs text-gray-500">
        Document ID: {documentId} | Y.Doc Client ID: {yDoc.clientID} |
        Synced: {isSynced ? '✅' : '⏳'} |
        Shared Type Length: {sharedType.length}
      </div>
    </div>
  )
}

export default CollaborativeEditor
