import * as fs from "node:fs"; // filesystem utilities used by save-as handler
import * as path from "node:path";

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

import type { ExportToPdfOptions, SaveAsOptions } from "../shared/saveAs";

// Module-local in-flight guard to prevent concurrent Save As dialogs.
// Prefer a simple module-local boolean over augmenting the Electron App global.
let saveAsInProgress = false;

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
	const menu = Menu.buildFromTemplate(
		template as Electron.MenuItemConstructorOptions[],
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
		if (saveAsInProgress === true) {
			return {
				success: false,
				error: { code: "BUSY", message: "Save As dialog already open" },
			};
		}
		saveAsInProgress = true;
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
			const isYjs = options.format === "yjs-v1";
			const ext = isYjs ? "awdoc" : "json";
			const defaultName =
				options.defaultPath ||
				(options.documentTitle
					? `${String(options.documentTitle)}.${ext}`
					: `Untitled.${ext}`);
			const filters = isYjs
				? [{ name: "AuraWrite Document", extensions: ["awdoc"] }]
				: [{ name: "JSON", extensions: ["json"] }];

			// Build platform-appropriate properties for the save dialog.
			const dialogProperties: Array<
				"createDirectory" | "showOverwriteConfirmation"
			> = ["showOverwriteConfirmation"];
			// createDirectory is macOS-only in Electron; include it only on darwin.
			if (process.platform === "darwin") {
				dialogProperties.push("createDirectory");
			}

			const { canceled, filePath } = await dialog.showSaveDialog({
				title: "Save As",
				defaultPath: defaultName,
				filters,
				properties: dialogProperties,
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

			// Use an atomic replace; on Windows a direct rename can fail with EPERM/EEXIST
			// if the destination already exists. Retry by unlinking the destination
			// and attempting the rename again only for the specific Windows error cases.
			try {
				await fs.promises.rename(tmpPath, filePath);
			} catch (err: unknown) {
				// If on Windows and we received a race-related error, attempt to unlink
				// the destination and retry the rename. Propagate any errors from unlink
				// or the second rename to the caller.
				const maybeErr =
					err && typeof err === "object"
						? (err as Record<string, unknown>)
						: null;
				const code =
					maybeErr && "code" in maybeErr
						? String((maybeErr as Record<string, unknown>).code)
						: undefined;
				if (
					process.platform === "win32" &&
					code &&
					(code === "EPERM" || code === "EEXIST")
				) {
					// Attempt to remove the destination and retry the rename; allow any error to propagate.
					await fs.promises.unlink(filePath);
					await fs.promises.rename(tmpPath, filePath);
				} else {
					// Non-Windows or unexpected error: throw a new Error with context to avoid a useless rethrow.
					throw new Error(`Atomic rename failed: ${String(err)}`);
				}
			}

			// Best-effort: ensure no leftover temp file remains
			try {
				await fs.promises.unlink(tmpPath);
			} catch {
				/* ignore */
			}

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
			saveAsInProgress = false;
		}
	},
);

app.whenReady().then(() => {
	// Export to PDF IPC handler
	ipcMain.handle(
		"export-to-pdf",
		async (_event: unknown, opts: ExportToPdfOptions) => {
			// Prevent concurrent export dialogs
			if (saveAsInProgress === true) {
				return {
					success: false,
					error: { code: "BUSY", message: "Export dialog already open" },
				};
			}
			saveAsInProgress = true;
			try {
				if (
					!opts ||
					typeof opts !== "object" ||
					!opts.html ||
					typeof opts.html !== "string"
				) {
					return {
						success: false,
						error: {
							code: "INVALID_PAYLOAD",
							message: "Missing html string in options",
						},
					};
				}

				const defaultName =
					opts.defaultPath ||
					(opts.documentTitle
						? `${String(opts.documentTitle)}.pdf`
						: "Untitled.pdf");
				const { canceled, filePath } = await dialog.showSaveDialog({
					title: "Export as PDF",
					defaultPath: defaultName,
					filters: [{ name: "PDF", extensions: ["pdf"] }],
					properties:
						process.platform === "darwin"
							? ["showOverwriteConfirmation", "createDirectory"]
							: ["showOverwriteConfirmation"],
				});

				if (canceled || !filePath) {
					return {
						success: false,
						error: { code: "CANCELLED", message: "User cancelled" },
					};
				}

				// Create a hidden BrowserWindow to render the printable HTML
				let exportWin: BrowserWindow | null = null;
				let loadTimeout: NodeJS.Timeout | null = null;
				try {
					exportWin = new BrowserWindow({
						show: false,
						webPreferences: {
							offscreen: false,
							contextIsolation: true,
							nodeIntegration: false,
							sandbox: true,
						},
					});

					// Ensure content finished loading, with a timeout that won't leak exportWin.
					// Attach the did-finish-load listener before calling loadURL so we never miss
					// the event if the load completes synchronously.
					const waitForDidFinishLoad = () =>
						new Promise<void>((resolve, reject) => {
							const cleanup = () => {
								if (loadTimeout) {
									clearTimeout(loadTimeout);
									loadTimeout = null;
								}
								if (exportWin?.webContents) {
									exportWin.webContents.removeListener("did-fail-load", onFail);
									exportWin.webContents.removeListener(
										"did-finish-load",
										onFinish,
									);
								}
							};
							const onFinish = () => {
								cleanup();
								resolve();
							};
							const onFail = (_e: unknown, code: number, desc: string) => {
								cleanup();
								reject(
									new Error(`Failed to load export content (${code}): ${desc}`),
								);
							};
							loadTimeout = setTimeout(() => {
								cleanup();
								reject(
									new Error("Timed out waiting for export content to load"),
								);
							}, 10000);
							if (exportWin?.webContents) {
								exportWin.webContents.once("did-finish-load", onFinish);
								exportWin.webContents.once("did-fail-load", onFail);
							} else {
								cleanup();
								reject(new Error("Export window not available"));
							}
						});

					// Start waiting for the load to finish, then initiate the load URL.
					const didFinishPromise = waitForDidFinishLoad();
					await exportWin.loadURL(
						`data:text/html;charset=utf-8,${encodeURIComponent(opts.html)}`,
					);
					// Await the did-finish-load (or timeout) after starting the load.
					await didFinishPromise;

					// Print to PDF with background graphics
					const pdfOptions = { printBackground: true, marginsType: 0 };
					const pdfBuffer = await exportWin.webContents.printToPDF(pdfOptions);

					// Write atomically
					const tmpPath = `${filePath}.tmp`;
					await fs.promises.writeFile(tmpPath, pdfBuffer);
					try {
						await fs.promises.rename(tmpPath, filePath);
					} catch (err: unknown) {
						// Attempt Windows-specific retry semantics
						const maybeErr =
							err && typeof err === "object"
								? (err as Record<string, unknown>)
								: null;
						const code =
							maybeErr && "code" in maybeErr
								? String((maybeErr as Record<string, unknown>).code)
								: undefined;
						if (
							process.platform === "win32" &&
							code &&
							(code === "EPERM" || code === "EEXIST")
						) {
							await fs.promises.unlink(filePath);
							await fs.promises.rename(tmpPath, filePath);
						} else {
							throw err;
						}
					}

					const bytesWritten = pdfBuffer.length;
					return { success: true, filePath, bytesWritten };
				} finally {
					// Always clear the timeout and ensure the export window is closed/destroyed
					if (loadTimeout) {
						clearTimeout(loadTimeout);
						loadTimeout = null;
					}
					if (exportWin) {
						try {
							// Close may throw in rare cases; ensure we also destroy to avoid leaks.
							if (!exportWin.isDestroyed()) {
								exportWin.close();
							}
						} catch {
							/* swallow close errors */
						} finally {
							try {
								if (!exportWin.isDestroyed()) {
									exportWin.destroy();
								}
							} catch {
								/* swallow destroy errors */
							}
							exportWin = null;
						}
					}
				}
			} catch (err) {
				console.error("Failed to export-to-pdf:", err);
				return {
					success: false,
					error: {
						code: "WRITE_FAILED",
						message: err instanceof Error ? err.message : String(err),
					},
				};
			} finally {
				saveAsInProgress = false;
			}
		},
	);

	// IPC handler to reveal a file in the system file manager
	ipcMain.handle(
		"show-item-in-folder",
		async (_event: unknown, filePath: unknown) => {
			try {
				// Basic validation
				if (!filePath || typeof filePath !== "string") {
					return { success: false, error: "Invalid filePath" };
				}
				const trimmed = filePath.trim();
				if (!trimmed) {
					return { success: false, error: "Empty filePath" };
				}

				// Attempt to reveal the item in the OS file manager
				try {
					shell.showItemInFolder(trimmed);
					return { success: true };
				} catch (err) {
					console.error("shell.showItemInFolder failed:", err);
					return {
						success: false,
						error: err instanceof Error ? err.message : String(err),
					};
				}
			} catch (err) {
				console.error("show-item-in-folder handler error:", err);
				return {
					success: false,
					error: err instanceof Error ? err.message : "Unknown error",
				};
			}
		},
	);
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
