import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import CollaborativeEditingTest from "../components/CollaborativeEditingTest";
import "./index.css";
import { ErrorProvider } from "@/contexts/ErrorContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
		<div className="min-h-screen">
			<header className="bg-white shadow-sm border-b">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex justify-between items-center py-4">
						<h1 className="text-xl font-semibold text-gray-900">AuraWrite</h1>
						<button
							type="button"
							onClick={() => void signOut()}
							className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
						>
							Sign Out
						</button>
					</div>
				</div>
			</header>

			<main className="py-8">
				<CollaborativeEditingTest />
			</main>
		</div>
	);
}

export default App;
