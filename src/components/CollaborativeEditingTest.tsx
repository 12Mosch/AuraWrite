import { useMutation, useQuery } from "convex/react";
import type React from "react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConvexCollaborativeEditor } from "./ConvexCollaborativeEditor";
import ConvexDebugInfo from "./ConvexDebugInfo";

/**
 * Test component to verify collaborative editing functionality
 * Shows two editors side by side editing the same document
 */
export const CollaborativeEditingTest: React.FC = () => {
	const [testDocumentId, setTestDocumentId] = useState<Id<"documents"> | null>(
		null,
	);
	const [isCreatingDocument, setIsCreatingDocument] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const createDocument = useMutation(api.documents.createDocument);
	const userDocuments = useQuery(api.documents.getUserDocuments);

	// Create a test document when component mounts
	useEffect(() => {
		const createTestDocument = async () => {
			if (testDocumentId || isCreatingDocument) return; // Already created or creating

			setIsCreatingDocument(true);
			setError(null);
			try {
				const docId = await createDocument({
					title: "Collaborative Editing Test Document",
					content: JSON.stringify([
						{
							type: "paragraph",
							children: [{ text: "Start typing to test collaboration..." }],
						},
					]),
					isPublic: false,
				});
				setTestDocumentId(docId);
				console.log("Test document created:", docId);
			} catch (error) {
				console.error("Failed to create test document:", error);
				setError("Failed to create test document. Please try again.");
			} finally {
				setIsCreatingDocument(false);
			}
		};

		createTestDocument();
	}, [createDocument, testDocumentId, isCreatingDocument]);

	const handleCreateNewDocument = async () => {
		setIsCreatingDocument(true);
		setError(null);
		try {
			const docId = await createDocument({
				title: `Test Document ${new Date().toLocaleTimeString()}`,
				content: JSON.stringify([
					{ type: "paragraph", children: [{ text: "New test document..." }] },
				]),
				isPublic: false,
			});
			setTestDocumentId(docId);
		} catch (error) {
			console.error("Failed to create document:", error);
			setError("Failed to create document. Please try again.");
		} finally {
			setIsCreatingDocument(false);
		}
	};

	const handleSelectDocument = (docId: Id<"documents">) => {
		setTestDocumentId(docId);
		setError(null);
	};

	if (isCreatingDocument && !testDocumentId) {
		return (
			<div className="max-w-6xl mx-auto p-6">
				<div className="bg-white rounded-lg shadow-lg p-6">
					<div className="flex items-center justify-center">
						<div className="text-lg">Creating test document...</div>
					</div>
				</div>
			</div>
		);
	}

	if (error && !testDocumentId) {
		return (
			<div className="max-w-6xl mx-auto p-6">
				<div className="bg-white rounded-lg shadow-lg p-6">
					<div className="bg-red-50 border border-red-200 rounded-md p-4">
						<p className="text-red-700">{error}</p>
						<button
							onClick={handleCreateNewDocument}
							className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
						>
							Try Again
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-6xl mx-auto p-6 space-y-6">
			<div className="bg-white rounded-lg shadow-lg p-6">
				<h1 className="text-2xl font-bold text-gray-900 mb-4">
					Collaborative Editing Test
				</h1>

				<div className="mb-6 p-4 bg-blue-50 rounded-lg">
					<h2 className="text-lg font-semibold text-blue-900 mb-2">
						Test Instructions:
					</h2>
					<ul className="list-disc list-inside text-blue-800 space-y-1">
						<li>
							Both editors below are connected to the same Convex document
						</li>
						<li>
							Type in one editor and watch the changes appear in the other
						</li>
						<li>
							Open this page in multiple browser tabs to test real-time sync
						</li>
						<li>Changes should persist and sync across all instances</li>
					</ul>
				</div>

				{/* Debug Info */}
				<ConvexDebugInfo />

				{/* Document Controls */}
				<div className="mb-6 p-4 bg-gray-50 rounded-lg">
					<div className="flex flex-wrap gap-4 items-center mb-4">
						<button
							onClick={handleCreateNewDocument}
							disabled={isCreatingDocument}
							className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
						>
							{isCreatingDocument ? "Creating..." : "Create New Test Document"}
						</button>
					</div>

					{error && (
						<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
							<p className="text-red-700 text-sm">{error}</p>
						</div>
					)}

					<div className="mb-4 text-sm text-gray-600">
						<p>
							<strong>Current Document ID:</strong>{" "}
							<code className="bg-gray-200 px-2 py-1 rounded">
								{testDocumentId}
							</code>
						</p>
					</div>

					{/* Document List */}
					{userDocuments && userDocuments.length > 0 && (
						<div className="mb-4">
							<h4 className="text-sm font-medium text-gray-900 mb-2">
								Available Documents:
							</h4>
							<div className="flex flex-wrap gap-2">
								{userDocuments.slice(0, 5).map((doc) => (
									<button
										key={doc._id}
										onClick={() => handleSelectDocument(doc._id)}
										className={`px-3 py-1 text-xs rounded-md transition-colors ${
											doc._id === testDocumentId
												? "bg-blue-600 text-white"
												: "bg-gray-200 text-gray-700 hover:bg-gray-300"
										}`}
									>
										{doc.title}
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				{testDocumentId && (
					<>
						{/* First Editor */}
						<div className="mb-6">
							<h3 className="text-lg font-semibold text-gray-900 mb-3">
								Editor 1
							</h3>
							<ConvexCollaborativeEditor
								documentId={testDocumentId}
								placeholder="Type here to test collaborative editing..."
								className="w-full"
								showHeader={true}
								enableSync={true}
								showPerformanceMonitor={true}
							/>
						</div>

						{/* Second Editor */}
						<div className="mb-6">
							<h3 className="text-lg font-semibold text-gray-900 mb-3">
								Editor 2 (Same Document)
							</h3>
							<p className="text-sm text-gray-600 mb-3">
								This editor is connected to the same document. Changes should
								sync in real-time.
							</p>
							<ConvexCollaborativeEditor
								documentId={testDocumentId}
								placeholder="Changes from Editor 1 should appear here..."
								className="w-full border-2 border-green-200"
								showHeader={false}
								enableSync={true}
							/>
						</div>
					</>
				)}
			</div>
		</div>
	);
};

export default CollaborativeEditingTest;
