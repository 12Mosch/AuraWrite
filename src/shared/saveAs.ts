export type SaveAsErrorCode = "CANCELLED" | "WRITE_FAILED";

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

export interface SaveAsOptions {
	documentId?: string;
	documentTitle?: string;
	defaultPath?: string;
	format: "yjs-v1" | "slate-v1";
	yjsUpdate?: ArrayBuffer; // required when format === 'yjs-v1'
	yjsProtocolVersion?: number;
	slateContent?: unknown; // required when format === 'slate-v1'
}
