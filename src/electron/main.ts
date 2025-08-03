const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

// __dirname is available in CommonJS
// const __dirname is already available

const createWindow = () => {
	const win = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(__dirname, "preload.cjs"),
		},
	});

	// In development, load from Vite dev server
	// In production, load from built files
	if (process.env.NODE_ENV === "development") {
		win.loadURL("http://localhost:5173");
		// Open DevTools in development
		win.webContents.openDevTools();
	} else {
		// Load the built HTML file
		win.loadFile(path.join(__dirname, "../dist-react/index.html"));
	}
};

// IPC handlers for external URL opening
ipcMain.handle("open-external", async (_event: unknown, url: string) => {
	try {
		// Validate URL input
		if (!url || typeof url !== "string") {
			throw new Error("Invalid URL provided");
		}

		const trimmedUrl = url.trim();
		if (!trimmedUrl) {
			throw new Error("Empty URL provided");
		}

		// Parse and validate URL structure
		let parsedUrl: URL;
		try {
			// First try parsing as-is
			parsedUrl = new URL(trimmedUrl);
		} catch {
			// If parsing fails, try with https:// prefix for convenience
			try {
				parsedUrl = new URL(`https://${trimmedUrl}`);
			} catch {
				throw new Error("Invalid URL format");
			}
		}

		// Validate protocol - only allow http and https
		const allowedProtocols = ["http:", "https:"];
		if (!allowedProtocols.includes(parsedUrl.protocol)) {
			throw new Error(
				`Unsafe protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`,
			);
		}

		// Additional security checks
		if (!parsedUrl.hostname) {
			throw new Error("URL must have a valid hostname");
		}

		// Open URL in system browser using the validated URL
		await shell.openExternal(parsedUrl.toString());
		return { success: true };
	} catch (error) {
		console.error("Failed to open external URL:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
});

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
