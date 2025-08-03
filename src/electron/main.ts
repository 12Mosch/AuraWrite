const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell, Menu } = require("electron");

// Create the application menu template
const createMenuTemplate = () => {
	const template = [
		{
			label: "File",
			submenu: [
				{
					label: "New Document",
					accelerator: "CmdOrCtrl+N",
					click: () => {
						// Send menu action to renderer
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "file.new");
						}
					},
				},
				{
					label: "Open",
					accelerator: "CmdOrCtrl+O",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "file.open");
						}
					},
				},
				{ type: "separator" },
				{
					label: "Save",
					accelerator: "CmdOrCtrl+S",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "file.save");
						}
					},
				},
				{
					label: "Save As...",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "file.saveAs");
						}
					},
				},
				{ type: "separator" },
				{
					label: "Export",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "file.export");
						}
					},
				},
			],
		},
		{
			label: "Edit",
			submenu: [
				{
					label: "Undo",
					accelerator: "CmdOrCtrl+Z",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "edit.undo");
						}
					},
				},
				{
					label: "Redo",
					accelerator: "CmdOrCtrl+Y",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "edit.redo");
						}
					},
				},
				{ type: "separator" },
				{
					label: "Cut",
					accelerator: "CmdOrCtrl+X",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "edit.cut");
						}
					},
				},
				{
					label: "Copy",
					accelerator: "CmdOrCtrl+C",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "edit.copy");
						}
					},
				},
				{
					label: "Paste",
					accelerator: "CmdOrCtrl+V",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "edit.paste");
						}
					},
				},
				{ type: "separator" },
				{
					label: "Find & Replace",
					accelerator: "CmdOrCtrl+F",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "edit.find");
						}
					},
				},
			],
		},
		{
			label: "View",
			submenu: [
				{
					label: "Toggle Toolbar",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send(
								"menu-action",
								"view.toggleToolbar",
							);
						}
					},
				},
				{
					label: "Toggle Status Bar",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send(
								"menu-action",
								"view.toggleStatusBar",
							);
						}
					},
				},
				{ type: "separator" },
				{
					label: "Zoom In",
					accelerator: "CmdOrCtrl+Plus",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "view.zoomIn");
						}
					},
				},
				{
					label: "Zoom Out",
					accelerator: "CmdOrCtrl+-",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "view.zoomOut");
						}
					},
				},
				{
					label: "Reset Zoom",
					accelerator: "CmdOrCtrl+0",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "view.resetZoom");
						}
					},
				},
			],
		},
		{
			label: "Format",
			submenu: [
				{
					label: "Bold",
					accelerator: "CmdOrCtrl+B",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "format.bold");
						}
					},
				},
				{
					label: "Italic",
					accelerator: "CmdOrCtrl+I",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "format.italic");
						}
					},
				},
				{
					label: "Underline",
					accelerator: "CmdOrCtrl+U",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "format.underline");
						}
					},
				},
				{ type: "separator" },
				{
					label: "Quote",
					accelerator: "CmdOrCtrl+Shift+Q",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send(
								"menu-action",
								"format.blockquote",
							);
						}
					},
				},
				{ type: "separator" },
				{
					label: "Align Left",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "format.alignLeft");
						}
					},
				},
				{
					label: "Align Center",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send(
								"menu-action",
								"format.alignCenter",
							);
						}
					},
				},
				{
					label: "Align Right",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send(
								"menu-action",
								"format.alignRight",
							);
						}
					},
				},
			],
		},
		{
			label: "Help",
			submenu: [
				{
					label: "About AuraWrite",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "help.about");
						}
					},
				},
				{
					label: "Keyboard Shortcuts",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send("menu-action", "help.shortcuts");
						}
					},
				},
				{
					label: "Documentation",
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.send(
								"menu-action",
								"help.documentation",
							);
						}
					},
				},
			],
		},
	];

	return template;
};

// Set up the application menu
const setupMenu = () => {
	const template = createMenuTemplate();
	const menu = Menu.buildFromTemplate(template);
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
