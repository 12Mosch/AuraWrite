import { useMutation, useQuery } from "convex/react";
import type React from "react";
import { useEffect, useState } from "react";
import type { Descendant } from "slate";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConvexCollaborativeEditor } from "./ConvexCollaborativeEditor";

/**
 * Demo component to showcase collaborative editing with Convex
 * This component demonstrates:
 * - Creating real Convex documents
 * - Real-time collaborative editing with Yjs and Convex
 * - Document management (create, list, switch)
 * - Multiple editor instances sharing the same document
 */
const CollaborativeEditorDemo: React.FC = () => {
	const [documentId, setDocumentId] = useState<Id<"documents"> | null>(null);
	const [customDocumentId, setCustomDocumentId] = useState("");
	const [validationError, setValidationError] = useState("");
	const [showMultipleEditors, setShowMultipleEditors] = useState(false);
	const [editorContent, setEditorContent] = useState<Descendant[]>([]);
	const [isCreatingDocument, setIsCreatingDocument] = useState(false);

	// Convex mutations and queries
	const createDocument = useMutation(api.documents.createDocument);
	const userDocuments = useQuery(api.documents.getUserDocuments);

	// Create initial document on mount
	useEffect(() => {
		const createInitialDocument = async () => {
			if (documentId || isCreatingDocument) return;

			setIsCreatingDocument(true);
			try {
				const docId = await createDocument({
					title: "Demo Document",
					content: JSON.stringify([
						{
							type: "paragraph",
							children: [
								{ text: "Start typing to test collaborative editing..." },
							],
						},
					]),
					isPublic: false,
				});
				setDocumentId(docId);
			} catch (error) {
				console.error("Failed to create initial document:", error);
				setValidationError("Failed to create document. Please try again.");
			} finally {
				setIsCreatingDocument(false);
			}
		};

		createInitialDocument();
	}, [createDocument, documentId, isCreatingDocument]);

	// Handle creating a new document
	const handleNewDocument = async () => {
		setIsCreatingDocument(true);
		setValidationError("");
		try {
			const docId = await createDocument({
				title: `Demo Document ${new Date().toLocaleTimeString()}`,
				content: JSON.stringify([
					{
						type: "paragraph",
						children: [{ text: "New document - start typing..." }],
					},
				]),
				isPublic: false,
			});
			setDocumentId(docId);
			setEditorContent([]);
		} catch (error) {
			console.error("Failed to create document:", error);
			setValidationError("Failed to create document. Please try again.");
		} finally {
			setIsCreatingDocument(false);
		}
	};

	// Handle switching to a custom document ID
	const handleCustomDocument = () => {
		if (customDocumentId) {
			try {
				// Try to parse as Convex ID
				const docId = customDocumentId as Id<"documents">;
				setDocumentId(docId);
				setEditorContent([]);
				setValidationError("");
			} catch (_error) {
				setValidationError("Please enter a valid Convex document ID");
			}
		} else {
			setValidationError("Please enter a document ID");
		}
	};

	// Handle editor content changes
	const handleEditorChange = (value: Descendant[]) => {
		setEditorContent(value);
	};

	// Handle switching to an existing document
	const handleSelectDocument = (docId: Id<"documents">) => {
		setDocumentId(docId);
		setEditorContent([]);
		setValidationError("");
	};

	return (
		<div className="max-w-6xl mx-auto p-6 space-y-6">
			<div className="bg-white rounded-lg shadow-lg p-6">
				<h1 className="text-2xl font-bold text-gray-900 mb-4">
					Collaborative Editor Demo - Real-time Convex Sync
				</h1>

				<div className="mb-6 p-4 bg-blue-50 rounded-lg">
					<h2 className="text-lg font-semibold text-blue-900 mb-2">
						Features Demonstrated:
					</h2>
					<ul className="list-disc list-inside text-blue-800 space-y-1">
						<li>
							<strong>Real Convex Documents:</strong> Documents are stored in
							Convex database
						</li>
						<li>
							<strong>Y.js + Convex Sync:</strong> Real-time collaborative
							editing with server persistence
						</li>
						<li>
							<strong>CRDT Conflict Resolution:</strong> Y.Doc handles
							concurrent edits automatically
						</li>
						<li>
							<strong>IndexedDB Persistence:</strong> Local caching for offline
							editing
						</li>
						<li>
							<strong>Multi-user Collaboration:</strong> Open multiple tabs to
							test real-time sync
						</li>
					</ul>
				</div>

				{/* Document Controls */}
				<div className="mb-6 p-4 bg-gray-50 rounded-lg">
					<h3 className="text-lg font-semibold text-gray-900 mb-3">
						Document Controls
					</h3>

					<div className="flex flex-wrap gap-4 items-center mb-4">
						<button
							type="button"
							onClick={handleNewDocument}
							disabled={isCreatingDocument}
							className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isCreatingDocument ? "Creating..." : "New Document"}
						</button>

						<div className="flex items-center gap-2">
							<input
								type="text"
								value={customDocumentId}
								onChange={(e) => {
									setCustomDocumentId(e.target.value);
									setValidationError("");
								}}
								placeholder="Enter Convex document ID"
								className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							<button
								type="button"
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

					{validationError && (
						<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
							<p className="text-red-700 text-sm">{validationError}</p>
						</div>
					)}

					<div className="mb-4 text-sm text-gray-600">
						<p>
							<strong>Current Document ID:</strong>{" "}
							<code className="bg-gray-200 px-2 py-1 rounded">
								{documentId || "Loading..."}
							</code>
						</p>
					</div>

					{/* Document List */}
					{userDocuments && userDocuments.length > 0 && (
						<div className="mb-4">
							<h4 className="text-sm font-medium text-gray-900 mb-2">
								Your Documents:
							</h4>
							<div className="flex flex-wrap gap-2">
								{userDocuments.slice(0, 5).map((doc) => (
									<button
										type="button"
										key={doc._id}
										onClick={() => handleSelectDocument(doc._id)}
										className={`px-3 py-1 text-xs rounded-md transition-colors ${
											doc._id === documentId
												? "bg-blue-600 text-white"
												: "bg-gray-200 text-gray-700 hover:bg-gray-300"
										}`}
									>
										{doc.title}
									</button>
								))}
								{userDocuments.length > 5 && (
									<span className="px-3 py-1 text-xs text-gray-500">
										+{userDocuments.length - 5} more
									</span>
								)}
							</div>
						</div>
					)}
				</div>

				{/* Primary Editor */}
				{documentId && (
					<div className="mb-6">
						<h3 className="text-lg font-semibold text-gray-900 mb-3">
							Primary Editor
						</h3>
						<ConvexCollaborativeEditor
							documentId={documentId}
							placeholder="Start typing to test collaborative editing..."
							onChange={handleEditorChange}
							className="w-full"
							showHeader={true}
							enableSync={true}
						/>
					</div>
				)}

				{/* Secondary Editor (for testing collaboration) */}
				{showMultipleEditors && documentId && (
					<div className="mb-6">
						<h3 className="text-lg font-semibold text-gray-900 mb-3">
							Secondary Editor (Same Document)
						</h3>
						<p className="text-sm text-gray-600 mb-3">
							This editor shares the same Convex document. Changes made in one
							editor will sync in real-time to the other, demonstrating
							collaborative editing.
						</p>
						<ConvexCollaborativeEditor
							documentId={documentId}
							placeholder="This editor shares the same document..."
							className="w-full border-2 border-green-200"
							showHeader={false}
							enableSync={true}
						/>
					</div>
				)}

				{!documentId && (
					<div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
						<p className="text-yellow-700">Creating document... Please wait.</p>
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
							<strong>Y.Doc Creation:</strong> Each CollaborativeEditor
							component creates a Y.Doc instance using the useYjsDocument hook,
							which handles initialization and cleanup.
						</p>
						<p>
							<strong>Shared Types:</strong> We use Y.XmlText (not Y.Text) for
							Slate.js compatibility, as recommended by the slate-yjs
							documentation.
						</p>
						<p>
							<strong>IndexedDB Persistence:</strong> Documents are
							automatically persisted to IndexedDB using y-indexeddb, enabling
							offline editing and data persistence across sessions.
						</p>
						<p>
							<strong>Normalization:</strong> The editor includes normalization
							rules to ensure it always has valid children, preventing crashes
							during collaborative editing.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default CollaborativeEditorDemo;
