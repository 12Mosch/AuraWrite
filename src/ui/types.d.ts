/**
 * Ambient types for renderer globals exposed by the preload script.
 *
 * This file provides a single global augmentation for `window.electronAPI`
 * so renderer files can reference the API without inline `any` casts.
 *
 * Keep this in-sync with `src/electron/preload.ts`.
 */

import type { SaveAsOptions, SaveAsResult } from "../shared/saveAs";

declare global {
	interface ElectronAPI {
		// Menu action subscription helpers (preload exposes these)
		onMenuAction?: (callback: (action: string) => void) => void;
		removeMenuActionListener?: (callback: (action: string) => void) => void;

		// Save As bridge
		saveAsNative?: (opts: SaveAsOptions) => Promise<SaveAsResult>;

		// Other small utilities the preload may expose in future:
		openExternal?: (
			url: string,
		) => Promise<{ success: boolean; error?: string }>;
	}

	interface Window {
		electronAPI?: ElectronAPI;
		isElectron?: boolean;
	}
}
