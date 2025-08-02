import { useAuthActions } from "@convex-dev/auth/react";
import {
	Authenticated,
	AuthLoading,
	Unauthenticated,
	useMutation,
	useQuery,
} from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuraTextEditor } from "@/components/editor";
import { ErrorProvider } from "@/contexts/ErrorContext";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import "./index.css";

// Demo document content constant
const DEMO_DOCUMENT_CONTENT = JSON.stringify([
	{
		type: "paragraph",
		children: [{ text: "Welcome to AuraWrite! Start typing to begin..." }],
	},
]);

function App() {
	return (
		<ErrorProvider>
			<ErrorBoundary>
				<div className="min-h-screen bg-gray-50">
					<AuthLoading>
						<div className="flex items-center justify-center min-h-screen">
							<div className="text-lg">Loading...</div>
						</div>
					</AuthLoading>

					<Unauthenticated>
						<SignInForm />
					</Unauthenticated>

					<Authenticated>
						<AuthenticatedApp />
					</Authenticated>
				</div>
			</ErrorBoundary>
		</ErrorProvider>
	);
}

function SignInForm() {
	const { signIn } = useAuthActions();

	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="bg-white p-8 rounded-lg shadow-md w-96">
				<h1 className="text-2xl font-bold mb-6 text-center">AuraWrite</h1>
				<p className="text-gray-600 mb-6 text-center">
					Collaborative document editor with real-time sync
				</p>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						const formData = new FormData(event.currentTarget);
						void signIn("password", formData);
					}}
					className="space-y-4"
				>
					<div>
						<input
							name="email"
							placeholder="Email"
							type="email"
							required
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<input
							name="password"
							placeholder="Password"
							type="password"
							required
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<input name="flow" type="hidden" value="signIn" />
					<button
						type="submit"
						className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						Sign In
					</button>
				</form>

				<div className="mt-4 text-center">
					<button
						type="button"
						onClick={() => {
							const form = document.querySelector("form");
							const flowInput = form?.querySelector(
								'input[name="flow"]',
							) as HTMLInputElement;
							if (flowInput) {
								flowInput.value =
									flowInput.value === "signIn" ? "signUp" : "signIn";
								const button = form?.querySelector(
									'button[type="submit"]',
								) as HTMLButtonElement;
								if (button) {
									button.textContent =
										flowInput.value === "signIn" ? "Sign In" : "Sign Up";
								}
							}
						}}
						className="text-blue-600 hover:text-blue-800"
					>
						Need an account? Sign up
					</button>
				</div>
			</div>
		</div>
	);
}

function AuthenticatedApp() {
	const { signOut } = useAuthActions();
	const [documentId, setDocumentId] = useState<Id<"documents"> | null>(null);
	const [isCreatingDocument, setIsCreatingDocument] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Get user's documents
	const userDocuments = useQuery(api.documents.getUserDocuments);

	// Get current document details
	const currentDocument = useQuery(
		api.documents.getDocument,
		documentId ? { documentId } : "skip",
	);

	// Create document mutation
	const createDocument = useMutation(api.documents.createDocument);

	// Handle new document creation
	const handleNewDocument = useCallback(async () => {
		try {
			const newDocumentId = await createDocument({
				title: "Untitled Document",
				content: JSON.stringify([
					{ type: "paragraph", children: [{ text: "" }] },
				]),
				isPublic: false,
			});

			// Navigate to the new document
			setDocumentId(newDocumentId);
		} catch (error) {
			console.error("Failed to create new document:", error);
			throw error; // Re-throw to let the editor handle the error
		}
	}, [createDocument]);

	// Create or get the demo document
	useEffect(() => {
		// Clear any previous errors when userDocuments changes
		setError(null);

		if (userDocuments && userDocuments.length === 0 && !isCreatingDocument) {
			// No documents exist and we're not already creating one, create a demo document
			setIsCreatingDocument(true);

			createDocument({
				title: "My First Document",
				content: DEMO_DOCUMENT_CONTENT,
				isPublic: false,
			})
				.then((newDocumentId) => {
					setDocumentId(newDocumentId);
					setIsCreatingDocument(false);
				})
				.catch((error) => {
					console.error("Failed to create demo document:", error);
					setError(
						"Failed to create your first document. Please try refreshing the page.",
					);
					setIsCreatingDocument(false);
				});
		} else if (userDocuments && userDocuments.length > 0) {
			// Use the first document
			setDocumentId(userDocuments[0]._id);
		}
	}, [userDocuments, createDocument, isCreatingDocument]);

	// Show error state if there's an error
	if (error) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen">
				<div className="text-red-600 text-lg mb-4">{error}</div>
				<button
					type="button"
					onClick={() => {
						setError(null);
						// Trigger a retry by clearing the document ID if needed
						if (!documentId) {
							setDocumentId(null);
						}
					}}
					className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					Try Again
				</button>
			</div>
		);
	}

	// Show loading while we determine which document to use
	if (!documentId) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-lg">
					{isCreatingDocument
						? "Creating your first document..."
						: "Loading document..."}
				</div>
			</div>
		);
	}

	return (
		<div className="h-screen">
			<AuraTextEditor
				documentId={documentId}
				documentTitle={currentDocument?.title ?? "Untitled Document"}
				showMenuBar={true}
				showToolbar={true}
				showStatusBar={true}
				className="h-full"
				onSignOut={() => void signOut()}
				onNewDocument={handleNewDocument}
				onSave={(value) => {
					console.log("Saving document:", value);
					// Document saving is now handled automatically by the collaboration system
				}}
				onChange={(value) => {
					console.log("Document changed:", value);
					// Real-time collaboration is now handled automatically!
				}}
			/>
		</div>
	);
}

export default App;
