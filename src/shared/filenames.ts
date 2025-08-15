import filenamify from "filenamify";

/**
 * Sanitize a user-provided title for filesystem-safe usage across platforms.
 *
 * Behavior:
 * - Replaces characters illegal on Windows/macOS/Linux with "_".
 * - Avoids Windows reserved device names (e.g., CON, PRN, AUX, COM1, LPT1, etc.).
 * - Trims trailing dots/spaces which Windows does not allow.
 * - Enforces a reasonable max length, defaulting to 128 characters.
 * - Falls back to "Untitled" if the result becomes empty.
 */
export function sanitizeFilename(
	name: string,
	options?: { maxLength?: number; replacement?: string },
): string {
	const maxLength = options?.maxLength ?? 128;
	const replacement = options?.replacement ?? "_";

	const base = typeof name === "string" && name.length > 0 ? name : "Untitled";
	const sanitized = filenamify(base, { replacement, maxLength });
	const trimmedEnd = sanitized.replace(/[.\s]+$/g, "");
	const finalName = trimmedEnd.replace(/^\s+/g, "");
	return finalName || "Untitled";
}

export default sanitizeFilename;
