/// <reference types="vite/client" />

// CSS Module declarations for regular CSS imports (side-effect imports)
declare module "*.css" {
	const content: string;
	export default content;
}

declare module "*.scss" {
	const content: string;
	export default content;
}

declare module "*.sass" {
	const content: string;
	export default content;
}

declare module "*.less" {
	const content: string;
	export default content;
}

// CSS Module declarations for CSS modules (when using ?module suffix)
declare module "*.module.css" {
	const classes: Record<string, string>;
	export default classes;
}

declare module "*.module.scss" {
	const classes: Record<string, string>;
	export default classes;
}

declare module "*.module.sass" {
	const classes: Record<string, string>;
	export default classes;
}

declare module "*.module.less" {
	const classes: Record<string, string>;
	export default classes;
}

// Electron API declarations
interface ElectronAPI {
	openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
	onMenuAction: (callback: (action: string) => void) => void;
	removeMenuActionListener: (callback: (action: string) => void) => void;
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
		isElectron?: boolean;
	}
}
