import {useAuthActions} from "@convex-dev/auth/react";
import {Authenticated, AuthLoading, Unauthenticated} from "convex/react";
import {AuraTextEditor} from "@/components/editor";
import "./index.css";
import {ErrorBoundary} from "@/components/ErrorBoundary";
import {ErrorProvider} from "@/contexts/ErrorContext";

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

	return (
		<div className="h-screen">
			<AuraTextEditor
				documentTitle="My Document"
				showMenuBar={true}
				showToolbar={true}
				showStatusBar={true}
				className="h-full"
				onSignOut={() => void signOut()}
				onSave={(value) => {
					console.log("Saving document:", value);
					// Here you would integrate with your backend/Convex
				}}
				onChange={(value) => {
					console.log("Document changed:", value);
					// Here you would handle real-time collaboration
				}}
			/>
		</div>
	);
}

export default App;
