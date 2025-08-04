const { contextBridge, ipcRenderer } = require("electron");

import type { IpcRendererEvent } from "electron";

/**
 * Preload script for AuraWrite Electron app
 *
 * This script runs in the renderer process and provides a secure bridge
 * between the main process and the renderer process.
 */

// Define the API interface
interface ElectronAPI {
	openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
	onMenuAction: (callback: (action: string) => void) => void;
	removeMenuActionListener: (callback: (action: string) => void) => void;
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
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Also expose a flag to indicate we're in Electron
contextBridge.exposeInMainWorld("isElectron", true);

// Type declarations are in src/ui/types.d.ts
