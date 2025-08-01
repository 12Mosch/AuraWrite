import { useMutation } from "convex/react";
import type React from "react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConvexCollaborativeEditor } from "../components/ConvexCollaborativeEditor";

/**
 * Test component to verify collaborative editing functionality
 * Shows two editors side by side editing the same document
 */
export const CollaborativeEditingTest: React.FC = () => {
	const [testDocumentId, setTestDocumentId] = useState<Id<"documents"> | null>(
		null,
	);
	const [showDebugInfo, setShowDebugInfo] = useState(true);
	const [isCreatingDocument, setIsCreatingDocument] = useState(false);

	const createDocument = useMutation(api.documents.createDocument);

	// Create a test document when component mounts
	useEffect(() => {
		const createTestDocument = async () => {
			if (testDocumentId) return; // Already created

			setIsCreatingDocument(true);
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
			} catch (error) {
				console.error("Failed to create test document:", error);
			} finally {
				setIsCreatingDocument(false);
			}
		};

		createTestDocument();
	}, [createDocument, testDocumentId]);

	if (isCreatingDocument) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-lg">Creating test document...</div>
			</div>
		);
	}

	if (!testDocumentId) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-lg text-red-600">
					Failed to create test document. Please refresh the page.
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-7xl mx-auto p-6 space-y-6">
			{/* Header */}
			<div className="text-center">
				<h1 className="text-3xl font-bold text-gray-900 mb-2">
					Collaborative Editing Test
				</h1>
				<p className="text-gray-600 mb-4">
					Test real-time collaboration by typing in either editor below. Changes
					should appear instantly in both editors.
				</p>

				{/* Controls */}
				<div className="flex justify-center gap-4 mb-6">
					<button
						onClick={() => setShowDebugInfo(!showDebugInfo)}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
					>
						{showDebugInfo ? "Hide" : "Show"} Debug Info
					</button>
				</div>
			</div>

			{/* Instructions */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<h3 className="font-semibold text-blue-900 mb-2">
					Testing Instructions:
				</h3>
				<ol className="list-decimal list-inside text-blue-800 space-y-1">
					<li>Type some text in the left editor</li>
					<li>Verify that the text appears in the right editor</li>
					<li>Type different text in the right editor</li>
					<li>Verify that both editors show the same content</li>
					<li>Try typing simultaneously in both editors</li>
				</ol>
			</div>

			{/* Two Editors Side by Side */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Left Editor */}
				<div className="space-y-2">
					<h2 className="text-xl font-semibold text-gray-800">Editor A</h2>
					<div className="border-2 border-green-300 rounded-lg overflow-hidden">
						<ConvexCollaborativeEditor
							documentId={testDocumentId}
							placeholder="Start typing in Editor A..."
							className="min-h-[400px]"
							enableSync={true}
							showHeader={showDebugInfo}
							useOptimizedSync={true}
							showPerformanceMonitor={showDebugInfo}
							onChange={(value) => {
								if (showDebugInfo) {
									console.log("Editor A content changed:", value);
								}
							}}
						/>
					</div>
				</div>

				{/* Right Editor */}
				<div className="space-y-2">
					<h2 className="text-xl font-semibold text-gray-800">Editor B</h2>
					<div className="border-2 border-blue-300 rounded-lg overflow-hidden">
						<ConvexCollaborativeEditor
							documentId={testDocumentId}
							placeholder="Start typing in Editor B..."
							className="min-h-[400px]"
							enableSync={true}
							showHeader={showDebugInfo}
							useOptimizedSync={true}
							showPerformanceMonitor={showDebugInfo}
							onChange={(value) => {
								if (showDebugInfo) {
									console.log("Editor B content changed:", value);
								}
							}}
						/>
					</div>
				</div>
			</div>

			{/* Debug Information */}
			{showDebugInfo && (
				<div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
					<h3 className="font-semibold text-gray-900 mb-2">
						Debug Information:
					</h3>
					<div className="text-sm text-gray-700 space-y-1">
						<p>
							<strong>Document ID:</strong> {testDocumentId}
						</p>
						<p>
							<strong>Expected Behavior:</strong> Changes in one editor should
							appear in the other within 1-2 seconds
						</p>
						<p>
							<strong>Check Console:</strong> Look for sync messages and any
							errors
						</p>
						<p>
							<strong>Network Tab:</strong> Should see WebSocket connections and
							Convex API calls
						</p>
					</div>
				</div>
			)}

			{/* Status Indicators */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="bg-green-50 border border-green-200 rounded-lg p-4">
					<h4 className="font-semibold text-green-900 mb-2">
						✅ Expected Results:
					</h4>
					<ul className="text-green-800 text-sm space-y-1">
						<li>• Text appears in both editors simultaneously</li>
						<li>• No conflicts when typing in both editors</li>
						<li>• Sync status shows "Connected" and "Synced"</li>
						<li>• No error messages in console</li>
					</ul>
				</div>

				<div className="bg-red-50 border border-red-200 rounded-lg p-4">
					<h4 className="font-semibold text-red-900 mb-2">
						❌ Potential Issues:
					</h4>
					<ul className="text-red-800 text-sm space-y-1">
						<li>• Text only appears in one editor</li>
						<li>• Long delays between edits</li>
						<li>• Sync status shows "Disconnected" or errors</li>
						<li>• Console shows network or sync errors</li>
					</ul>
				</div>
			</div>
		</div>
	);
};

export default CollaborativeEditingTest;
