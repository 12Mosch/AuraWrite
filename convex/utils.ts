/**
 * Shared Convex utilities.
 * parsePositiveInt: Returns input if it's a strictly positive integer; otherwise returns the fallback.
 * Does not round or floor non-integer values; non-integers, NaN, Infinity, and non-positives use the fallback.
 */
export function parsePositiveInt(input: unknown, fallback: number): number {
	const n = Number(input);
	return Number.isInteger(n) && n > 0 ? n : fallback;
}
