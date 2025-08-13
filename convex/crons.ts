import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Allow configuring the cleanup cadence at build/deploy time.
// Falls back to a safe default if not provided.
function parsePositiveInt(input: unknown, fallback: number): number {
	const n = Number(input);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const DEFAULT_MINUTES = 60;
// Attempt to read from process.env if available at build time.
// If not available, default to 60 minutes.
const CLEANUP_MINUTES = parsePositiveInt(
	typeof process !== "undefined"
		? process.env?.SEARCH_HISTORY_CLEANUP_INTERVAL_MINUTES
		: undefined,
	DEFAULT_MINUTES,
);

const crons = cronJobs();

/**
 * Runs a periodic cleanup that deletes search history entries older than the
 * configured retention window. The mutation itself reads retentionDays and
 * batchSize from Convex environment variables (with safe defaults) making the
 * runtime behavior configurable without redeploying code.
 *
 * Env vars (optional):
 * - SEARCH_HISTORY_CLEANUP_INTERVAL_MINUTES (number, default 60) - interval for this job
 * - SEARCH_HISTORY_RETENTION_DAYS (number, default 30) - age-based retention window
 * - SEARCH_HISTORY_DELETE_BATCH_SIZE (number, default 200) - deletion batch size
 */
crons.interval(
	"searchHistory.cleanupOldEntries",
	{ minutes: CLEANUP_MINUTES },
	internal.savedSearches.cleanupOldSearchHistory,
	{},
);

export default crons;
