export type YjsBinary = Uint8Array | ArrayBuffer;

export type SaveAsErrorCode =
	| "CANCELLED"
	| "WRITE_FAILED"
	| "INVALID_OPTIONS"
	| "DIALOG_FAILED"
	| "SERIALIZE_FAILED"
	| "UNKNOWN";

export interface SaveAsError {
	code: SaveAsErrorCode;
	message: string;
}

/**
 * Returned on successful save.
 * - filePath: absolute filesystem path to the saved file.
 * - bytesWritten: size in bytes of the final persisted file contents.
 */
export interface SaveAsSuccess {
	success: true;
	filePath: string;
	bytesWritten?: number;
}

export interface SaveAsFailure {
	success: false;
	error: SaveAsError;
}

export type SaveAsResult = SaveAsSuccess | SaveAsFailure;

export function isSaveAsSuccess(result: SaveAsResult): result is SaveAsSuccess {
	return result.success;
}

export function isSaveAsFailure(result: SaveAsResult): result is SaveAsFailure {
	return !result.success;
}

/**
 * Common, optional metadata carried with save requests:
 * - documentId: internal ID of the document in our DB.
 * - documentTitle: human-friendly title, may be used for dialog titles or default filenames.
 * - defaultPath: absolute path hint for the Save As dialog; not persisted automatically.
 */
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
	yjsUpdate: YjsBinary;
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
 * Options for exporting printable HTML to PDF via the main process.
 * Kept in the shared types so both preload and renderer reference a single shape.
 */
export type ExportToPdfOptions = Readonly<{
	html: string;
	documentTitle?: string;
	defaultPath?: string;
}>;

/**
 * Discriminated union of save options.
 */
export type SaveAsOptions = SaveAsYjsOptions | SaveAsSlateOptions;
