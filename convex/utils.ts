/**
 * Shared Convex utilities.
 * parsePositiveInt: Coerces input to a positive integer with Math.floor semantics.
 * Falls back to the provided default when input is not a finite positive number.
 */
export function parsePositiveInt(input: unknown, fallback: number): number {
	const n = Number(input);
	return Number.isInteger(n) && n > 0 ? n : fallback;
}
