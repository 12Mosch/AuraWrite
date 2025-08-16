const { contextBridge, ipcRenderer } = require("electron");

import type { IpcRendererEvent } from "electron";

/**
 * Preload script for AuraWrite Electron app
 *
 * This script runs in the renderer process and provides a secure bridge
 * between the main process and the renderer process.
 */

// Reuse shared Save As types to avoid drift between preload and UI
import type {
	ExportToPdfOptions,
	SaveAsOptions,
	SaveAsResult,
} from "../shared/saveAs";

// Define the API interface
interface ElectronAPI {
	openExternal: (
		url: string,
	) => Promise<{ success: true } | { success: false; error: string }>;
	onMenuAction: (callback: (action: string) => void) => void;
	removeMenuActionListener: (callback: (action: string) => void) => void;
	/**
	 * saveAsNative - persist a document to the user's filesystem via a Save dialog.
	 *
	 * Validation expectations (renderer should ensure):
	 *  - options.format must be present and be either 'yjs-v1' or 'slate-v1'
	 *  - when format === 'yjs-v1', options.yjsUpdate must be provided as an ArrayBuffer
	 *  - when format === 'slate-v1', options.slateContent must be provided
	 *
	 * The method is promise-based and will return a SaveAsResult describing the
	 * outcome. The renderer can inspect error.code to handle CANCELLED vs WRITE_FAILED.
	 */
	saveAsNative: (options: SaveAsOptions) => Promise<SaveAsResult>;

	/**
	 * exportToPdf - export provided printable HTML to PDF using the main process.
	 *
	 * Options:
	 *  - html: string (required) - printable HTML document (full HTML document expected)
	 *  - documentTitle?: string - optional title for dialog default filename
	 *  - defaultPath?: string - optional default path hint
	 *
	 * Returns a SaveAsResult-like object describing success and filePath
	 */
	exportToPdf: (
		opts: Readonly<{
			html: string;
			documentTitle?: string;
			defaultPath?: SaveAsOptions["defaultPath"];
		}>,
	) => Promise<SaveAsResult>;

	/**
	 * showItemInFolder - reveal a file in the OS file manager.
	 * Accepts a filePath string and returns { success: boolean; error?: string }
	 */
	showItemInFolder: (
		filePath: string,
	) => Promise<{ success: true } | { success: false; error: string }>;
}

// Store wrapper functions to enable proper cleanup
const menuActionListeners = new Map<
	(action: string) => void,
	(event: IpcRendererEvent, action: string) => void
>();

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
	openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
	onMenuAction: (callback: (action: string) => void) => {
		// Create wrapper function and store reference
		const wrapper = (_event: IpcRendererEvent, action: string) =>
			callback(action);
		menuActionListeners.set(callback, wrapper);
		ipcRenderer.on("menu-action", wrapper);
	},
	removeMenuActionListener: (callback: (action: string) => void) => {
		// Get the stored wrapper function and remove it
		const wrapper = menuActionListeners.get(callback);
		if (wrapper) {
			ipcRenderer.removeListener("menu-action", wrapper);
			menuActionListeners.delete(callback);
		}
	},
	// saveAsNative bridge - forwards options to main via ipcRenderer.invoke
	saveAsNative: (options: SaveAsOptions) =>
		ipcRenderer.invoke("save-as-native", options),

	// exportToPdf bridge - forwards printable HTML to main for PDF generation
	exportToPdf: (opts: ExportToPdfOptions) =>
		ipcRenderer.invoke("export-to-pdf", opts),

	// showItemInFolder - forwards to main process
	showItemInFolder: (filePath: string) =>
		ipcRenderer.invoke("show-item-in-folder", filePath),
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Also expose a flag to indicate we're in Electron
contextBridge.exposeInMainWorld("isElectron", true);

// Type declarations are in src/ui/types.d.ts
