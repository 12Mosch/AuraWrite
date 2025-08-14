import path = require("node:path");
import fs = require("node:fs"); // filesystem utilities used by save-as handler

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

/**
 * Types for the save-as IPC handler
 */
type SaveAsOptions = {
	documentId?: string;
	documentTitle?: string;
	defaultPath?: string;
	format: "yjs-v1" | "slate-v1";
	// Accept either ArrayBuffer or SharedArrayBuffer from the renderer to avoid
	// strict typing mismatches when SharedArrayBuffer is produced by the runtime.
	yjsUpdate?: ArrayBuffer | SharedArrayBuffer;
	yjsProtocolVersion?: number;
	slateContent?: unknown;
};

// Extend App type locally to store a guard flag without using `any`
interface AppWithSaveFlag {
	_auraSaveAsInProgress?: boolean;
}
const electronApp = app as unknown as AppWithSaveFlag;

// Helper function to send menu actions
const sendMenuAction = (action: string) => {
	const focusedWindow = BrowserWindow.getFocusedWindow();
	if (focusedWindow) {
		focusedWindow.webContents.send("menu-action", action);
	}
};

// Create the application menu template
const createMenuTemplate = () => {
	const template = [
		{
			label: "File",
			submenu: [
				{
					label: "New Document",
					accelerator: "CmdOrCtrl+N",
					click: () => sendMenuAction("file.new"),
				},
				{
					label: "Open",
					accelerator: "CmdOrCtrl+O",
					click: () => sendMenuAction("file.open"),
				},
				{ type: "separator" },
				{
					label: "Save",
					accelerator: "CmdOrCtrl+S",
					click: () => sendMenuAction("file.save"),
				},
				{
					label: "Save As...",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => sendMenuAction("file.saveAs"),
				},
				{ type: "separator" },
				{
					label: "Export",
					click: () => sendMenuAction("file.export"),
				},
			],
		},
		{
			label: "Edit",
			submenu: [
				{
					label: "Undo",
					accelerator: "CmdOrCtrl+Z",
					click: () => sendMenuAction("edit.undo"),
				},
				{
					label: "Redo",
					accelerator: "CmdOrCtrl+Y",
					click: () => sendMenuAction("edit.redo"),
				},
				{ type: "separator" },
				{
					label: "Cut",
					accelerator: "CmdOrCtrl+X",
					click: () => sendMenuAction("edit.cut"),
				},
				{
					label: "Copy",
					accelerator: "CmdOrCtrl+C",
					click: () => sendMenuAction("edit.copy"),
				},
				{
					label: "Paste",
					accelerator: "CmdOrCtrl+V",
					click: () => sendMenuAction("edit.paste"),
				},
				{ type: "separator" },
				{
					label: "Find & Replace",
					accelerator: "CmdOrCtrl+F",
					click: () => sendMenuAction("edit.find"),
				},
			],
		},
		{
			label: "View",
			submenu: [
				{
					label: "Toggle Toolbar",
					click: () => sendMenuAction("view.toggleToolbar"),
				},
				{
					label: "Toggle Status Bar",
					click: () => sendMenuAction("view.toggleStatusBar"),
				},
				{ type: "separator" },
				{
					label: "Zoom In",
					accelerator: "CmdOrCtrl+Plus",
					click: () => sendMenuAction("view.zoomIn"),
				},
				{
					label: "Zoom Out",
					accelerator: "CmdOrCtrl+-",
					click: () => sendMenuAction("view.zoomOut"),
				},
				{
					label: "Reset Zoom",
					accelerator: "CmdOrCtrl+0",
					click: () => sendMenuAction("view.resetZoom"),
				},
			],
		},
		{
			label: "Format",
			submenu: [
				{
					label: "Bold",
					accelerator: "CmdOrCtrl+B",
					click: () => sendMenuAction("format.bold"),
				},
				{
					label: "Italic",
					accelerator: "CmdOrCtrl+I",
					click: () => sendMenuAction("format.italic"),
				},
				{
					label: "Underline",
					accelerator: "CmdOrCtrl+U",
					click: () => sendMenuAction("format.underline"),
				},
				{ type: "separator" },
				{
					label: "Quote",
					accelerator: "CmdOrCtrl+Shift+Q",
					click: () => sendMenuAction("format.blockquote"),
				},
				{ type: "separator" },
				{
					label: "Align Left",
					click: () => sendMenuAction("format.alignLeft"),
				},
				{
					label: "Align Center",
					click: () => sendMenuAction("format.alignCenter"),
				},
				{
					label: "Align Right",
					click: () => sendMenuAction("format.alignRight"),
				},
			],
		},
		{
			label: "Help",
			submenu: [
				{
					label: "About AuraWrite",
					click: () => sendMenuAction("help.about"),
				},
				{
					label: "Keyboard Shortcuts",
					click: () => sendMenuAction("help.shortcuts"),
				},
				{
					label: "Documentation",
					click: () => sendMenuAction("help.documentation"),
				},
			],
		},
	];

	return template;
};

// Set up the application menu
const setupMenu = () => {
	const template = createMenuTemplate();
	// Cast the template into Electron-expected types via unknown to avoid `any`.
	const menu = Menu.buildFromTemplate(
		template as unknown as (
			| Electron.MenuItemConstructorOptions
			| Electron.MenuItem
		)[],
	);
	Menu.setApplicationMenu(menu);
};

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

// IPC handler to save a document to user's filesystem via Save As dialog.
// Expects options describing the payload and format. Performs an atomic write.
ipcMain.handle(
	"save-as-native",
	async (_event: unknown, options: SaveAsOptions) => {
		// Prevent multiple concurrent Save As dialogs across rapid invocations.
		if (electronApp._auraSaveAsInProgress === true) {
			return {
				success: false,
				error: { code: "BUSY", message: "Save As dialog already open" },
			};
		}
		electronApp._auraSaveAsInProgress = true;
		try {
			// Basic validation
			if (!options || typeof options !== "object" || !options.format) {
				return {
					success: false,
					error: {
						code: "INVALID_PAYLOAD",
						message: "Missing or invalid options.format",
					},
				};
			}

			// Determine default filename and filters
			const defaultName =
				options.defaultPath ||
				(options.documentTitle
					? `${String(options.documentTitle)}.awdoc`
					: "Untitled.awdoc");
			const isYjs = options.format === "yjs-v1";
			const filters = isYjs
				? [{ name: "AuraWrite Document", extensions: ["awdoc"] }]
				: [{ name: "JSON", extensions: ["json"] }];

			const { canceled, filePath } = await dialog.showSaveDialog({
				title: "Save As",
				defaultPath: defaultName,
				filters,
				properties: ["createDirectory", "showOverwriteConfirmation"],
			});

			if (canceled || !filePath) {
				return {
					success: false,
					error: { code: "CANCELLED", message: "User cancelled" },
				};
			}

			// Build JSON envelope
			let envelope: unknown = null;
			if (isYjs) {
				if (!options.yjsUpdate) {
					return {
						success: false,
						error: {
							code: "INVALID_PAYLOAD",
							message: "Missing yjsUpdate for yjs-v1 format",
						},
					};
				}
				// options.yjsUpdate is an ArrayBuffer per SaveAsOptions
				const updateBuf = Buffer.from(new Uint8Array(options.yjsUpdate));
				envelope = {
					format: "aura-v1",
					yjsProtocolVersion: options.yjsProtocolVersion || 1,
					title: options.documentTitle || null,
					updatedAt: Date.now(),
					yjsUpdateBase64: updateBuf.toString("base64"),
				};
			} else {
				// slate-v1
				envelope = {
					format: "slate-v1",
					title: options.documentTitle || null,
					updatedAt: Date.now(),
					content: options.slateContent ?? null,
				};
			}

			const json = JSON.stringify(envelope, null, 2);
			const tmpPath = `${filePath}.tmp`;
			await fs.promises.writeFile(tmpPath, json, "utf8");
			await fs.promises.rename(tmpPath, filePath);
			const bytesWritten = Buffer.byteLength(json, "utf8");
			return { success: true, filePath, bytesWritten };
		} catch (err) {
			console.error("Failed to save-as-native:", err);
			return {
				success: false,
				error: {
					code: "WRITE_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		} finally {
			electronApp._auraSaveAsInProgress = false;
		}
	},
);

app.whenReady().then(() => {
	setupMenu();
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
