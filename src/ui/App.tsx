import { useAuthActions } from "@convex-dev/auth/react";
import {
	Authenticated,
	AuthLoading,
	Unauthenticated,
	useMutation,
	useQuery,
} from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { DocumentDashboard } from "@/components/DocumentDashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuraTextEditor } from "@/components/editor";
import { ErrorProvider } from "@/contexts/ErrorContext";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import "./index.css";

function App() {
	return (
		<ErrorProvider>
			<ErrorBoundary>
				<div className="h-screen bg-gray-50 overflow-hidden">
					<AuthLoading>
						<div className="flex items-center justify-center h-full">
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
		<div className="flex items-center justify-center h-full">
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

type AppView = "dashboard" | "editor";

function AuthenticatedApp() {
	const { signOut } = useAuthActions();
	const [currentView, setCurrentView] = useState<AppView>("dashboard");
	const [documentId, setDocumentId] = useState<Id<"documents"> | null>(null);

	const [error, setError] = useState<string | null>(null);

	// Get user's documents (used by DocumentDashboard)
	// const userDocuments = useQuery(api.documents.getUserDocuments);

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
			setCurrentView("editor");
		} catch (error) {
			console.error("Failed to create new document:", error);
			throw error; // Re-throw to let the editor handle the error
		}
	}, [createDocument]);

	// Handle opening an existing document
	const handleDocumentOpen = useCallback((docId: Id<"documents">) => {
		setDocumentId(docId);
		setCurrentView("editor");
	}, []);

	// Handle exit to dashboard
	const handleExitToDashboard = useCallback(() => {
		setCurrentView("dashboard");
		setDocumentId(null);
	}, []);

	// Clear any previous errors when userDocuments changes
	useEffect(() => {
		setError(null);
	}, []);

	// Show error state if there's an error
	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full">
				<div className="text-red-600 text-lg mb-4">{error}</div>
				<button
					type="button"
					onClick={() => {
						setError(null);
					}}
					className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					Try Again
				</button>
			</div>
		);
	}

	// Render based on current view
	if (currentView === "dashboard") {
		return (
			<DocumentDashboard
				onDocumentOpen={handleDocumentOpen}
				onSignOut={() => void signOut()}
				onNewDocument={handleNewDocument}
			/>
		);
	}

	// Editor view - require documentId
	if (currentView === "editor" && documentId) {
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
					onExitToDashboard={handleExitToDashboard}
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

	// Fallback to dashboard if in invalid state
	return (
		<DocumentDashboard
			onDocumentOpen={handleDocumentOpen}
			onSignOut={() => void signOut()}
			onNewDocument={handleNewDocument}
		/>
	);
}

export default App;
