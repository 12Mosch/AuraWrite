/**
 * Environment detection utilities for AuraWrite
 *
 * This module provides utilities to detect the runtime environment
 * and handle platform-specific behaviors.
 */

// Type for window with Electron properties
interface ElectronWindow extends Window {
	isElectron?: boolean;
	electronAPI?: {
		openExternal: (
			url: string,
		) => Promise<{ success: boolean; error?: string }>;
	};
	require?: (module: string) => any;
	process?: {
		versions?: {
			electron?: string;
		};
	};
}

/**
 * Check if the application is running in an Electron environment
 *
 * @returns true if running in Electron, false if running in a web browser
 */
export const isElectron = (): boolean => {
	// Check for Electron-specific properties
	if (typeof window !== "undefined") {
		const electronWindow = window as ElectronWindow;

		// Check for our exposed isElectron flag (most reliable)
		if (electronWindow.isElectron === true) {
			return true;
		}

		// Check for electron in user agent
		if (window.navigator.userAgent.toLowerCase().includes("electron")) {
			return true;
		}

		// Check for electron-specific globals
		if (electronWindow.electronAPI || electronWindow.require) {
			return true;
		}

		// Check for process.versions.electron (if available)
		try {
			if (electronWindow.process?.versions?.electron) {
				return true;
			}
		} catch {
			// Ignore errors when accessing process
		}
	}

	return false;
};

/**
 * Check if the application is running in a web browser
 *
 * @returns true if running in a web browser, false if running in Electron
 */
export const isWeb = (): boolean => {
	return !isElectron();
};

/**
 * Get the current runtime environment
 *
 * @returns 'electron' or 'web'
 */
export const getEnvironment = (): "electron" | "web" => {
	return isElectron() ? "electron" : "web";
};

/**
 * Open a URL in the appropriate way based on the environment
 *
 * @param url - The URL to open
 * @param target - Target for web environment (default: '_blank')
 * @returns Promise that resolves when the URL is opened
 */
export const openUrl = async (
	url: string,
	target: string = "_blank",
): Promise<void> => {
	// Validate URL
	if (!url || typeof url !== "string") {
		console.warn("Invalid URL provided to openUrl:", url);
		return;
	}

	// Ensure URL has a protocol
	let finalUrl = url.trim();
	if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
		finalUrl = `https://${finalUrl}`;
	}

	try {
		if (isElectron()) {
			const electronWindow = window as ElectronWindow;

			// In Electron, use the shell API to open URLs in the system browser
			if (electronWindow.electronAPI?.openExternal) {
				// Use preload script API if available
				const result = await electronWindow.electronAPI.openExternal(finalUrl);
				if (!result.success) {
					throw new Error(result.error || "Failed to open external URL");
				}
			} else {
				// Fallback: try to use require if available (contextIsolation disabled)
				if (electronWindow.require) {
					const { shell } = electronWindow.require("electron");
					await shell.openExternal(finalUrl);
				} else {
					// Final fallback to window.open if Electron APIs are not available
					console.warn(
						"Electron shell API not available, falling back to window.open",
					);
					window.open(finalUrl, target, "noopener,noreferrer");
				}
			}
		} else {
			// In web browser, use window.open
			window.open(finalUrl, target, "noopener,noreferrer");
		}
	} catch (error) {
		console.error("Failed to open URL:", error);
		// Fallback to window.open
		window.open(finalUrl, target, "noopener,noreferrer");
	}
};

/**
 * Environment-specific configuration
 */
export const environmentConfig = {
	/**
	 * Get link attributes for the current environment
	 */
	getLinkAttributes: () => {
		if (isElectron()) {
			// In Electron, we'll handle clicks programmatically
			return {
				target: undefined,
				rel: undefined,
			};
		} else {
			// In web, use standard attributes
			return {
				target: "_blank",
				rel: "noopener noreferrer",
			};
		}
	},

	/**
	 * Check if links should be handled programmatically
	 */
	shouldHandleLinksManually: () => {
		return isElectron();
	},
};
