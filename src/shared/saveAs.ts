export type SaveAsErrorCode =
	| "CANCELLED"
	| "WRITE_FAILED"
	| "INVALID_OPTIONS"
	| "DIALOG_FAILED"
	| "SERIALIZE_FAILED";

export interface SaveAsSuccess {
	success: true;
	filePath: string;
	bytesWritten?: number;
}

export interface SaveAsFailure {
	success: false;
	error: { code: SaveAsErrorCode; message: string };
}

export type SaveAsResult = SaveAsSuccess | SaveAsFailure;

export interface SaveAsBase {
	documentId?: string;
	documentTitle?: string;
	defaultPath?: string;
}

/**
 * Options for saving a Yjs-format document.
 * - format is the discriminant.
 * - yjsUpdate is required and accepts binary buffers used across IPC.
 */
export interface SaveAsYjsOptions extends SaveAsBase {
	format: "yjs-v1";
	yjsUpdate: Uint8Array | ArrayBuffer;
	yjsProtocolVersion?: number;
}

/**
 * Options for saving a Slate-format document.
 */
export interface SaveAsSlateOptions extends SaveAsBase {
	format: "slate-v1";
	slateContent: unknown;
}

/**
 * Discriminated union of save options.
 */
export type SaveAsOptions = SaveAsYjsOptions | SaveAsSlateOptions;
