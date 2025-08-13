import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
	query,
} from "./_generated/server";
import { getCurrentUser } from "./authHelpers";
import { parsePositiveInt } from "./utils";

// Type definitions for saved search filters
const filterSchema = v.object({
	folderId: v.optional(v.id("folders")),
	status: v.optional(
		v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
	),
	tags: v.optional(v.array(v.string())),
	dateRange: v.optional(
		v.object({
			start: v.number(),
			end: v.number(),
		}),
	),
});

// ===== Search history retention config, helpers, and cleanup =====
const MS_IN_DAY = 86_400_000;

// Runtime config helper: reads Convex env first, then falls back to process.env.
// Parsing/validation uses parsePositiveInt and logs clear messages on malformed values.
type EnvCtx = { env?: { get?: (k: string) => string | undefined } };

const CONFIG_DEFAULTS = {
	SEARCH_HISTORY_MAX_PER_USER: 200,
	SEARCH_HISTORY_DELETE_BATCH_SIZE: 200,
	SEARCH_HISTORY_RETENTION_DAYS: 30,
} as const;

function runtimeEnvGet(
	ctx: unknown,
	key: keyof typeof CONFIG_DEFAULTS | string,
): string | undefined {
	const fromConvex = (ctx as EnvCtx)?.env?.get?.(key);
	if (fromConvex !== undefined) return fromConvex;
	// Fallback to process.env when not in Convex or when Convex value is undefined
	try {
		return typeof process !== "undefined" ? process.env?.[key] : undefined;
	} catch {
		return undefined;
	}
}

function readPositiveIntConfig(
	ctx: unknown,
	key: keyof typeof CONFIG_DEFAULTS,
	def: number,
): number {
	const raw = runtimeEnvGet(ctx, key);
	const parsed = parsePositiveInt(raw, def);
	if (raw !== undefined && parsed === def) {
		console.error(
			`[searchHistory.config] ${key} invalid: '${raw}' -> using default ${def}`,
		);
	}
	return parsed;
}

const searchHistoryConfig = {
	maxPerUser: (ctx: unknown): number =>
		readPositiveIntConfig(
			ctx,
			"SEARCH_HISTORY_MAX_PER_USER",
			CONFIG_DEFAULTS.SEARCH_HISTORY_MAX_PER_USER,
		),
	deleteBatchSize: (ctx: unknown): number =>
		readPositiveIntConfig(
			ctx,
			"SEARCH_HISTORY_DELETE_BATCH_SIZE",
			CONFIG_DEFAULTS.SEARCH_HISTORY_DELETE_BATCH_SIZE,
		),
	retentionDays: (ctx: unknown): number =>
		readPositiveIntConfig(
			ctx,
			"SEARCH_HISTORY_RETENTION_DAYS",
			CONFIG_DEFAULTS.SEARCH_HISTORY_RETENTION_DAYS,
		),
};

/**
 * Enforce a per-user cap on the number of search history entries.
 * Keeps the newest N (maxPerUser) entries and deletes older ones in ascending time order.
 * Idempotent and safe to run concurrently.
 */
async function enforcePerUserCap(
	ctx: MutationCtx,
	userId: Id<"users">,
): Promise<{ deleted: number }> {
	const maxPerUser = searchHistoryConfig.maxPerUser(ctx);
	if (maxPerUser <= 0) return { deleted: 0 };

	// Fetch the newest "maxPerUser" entries to keep.
	const keepers = await ctx.db
		.query("searchHistory")
		.withIndex("by_user_searched", (q) => q.eq("userId", userId))
		.order("desc")
		.take(maxPerUser);

	// If we currently have fewer than the cap, nothing to do.
	if (keepers.length < maxPerUser) return { deleted: 0 };

	// Keep exact N newest by id to handle duplicate timestamps safely.
	const keepIds = new Set(keepers.map((d) => d._id));

	const batchSize = Math.min(
		200,
		Math.max(1, searchHistoryConfig.deleteBatchSize(ctx)),
	);
	let deleted = 0;
	const start = Date.now();

	// Delete from the oldest side going forward, skipping keeper docs.
	while (true) {
		const batch = await ctx.db
			.query("searchHistory")
			.withIndex("by_user_searched", (q) => q.eq("userId", userId))
			.order("asc")
			.take(batchSize);

		if (batch.length === 0) break;

		let deletedInBatch = 0;
		for (const doc of batch) {
			if (!keepIds.has(doc._id)) {
				await ctx.db.delete(doc._id);
				deleted += 1;
				deletedInBatch += 1;
			}
		}

		// If we didn't delete anything in this batch, we've reached the kept range.
		if (deletedInBatch === 0) break;
		// Safety time bound to avoid long-running mutation.
		if (Date.now() - start > 5000) break;
	}

	const duration = Date.now() - start;
	console.log("[searchHistory.enforceCap]", {
		userId,
		maxPerUser,
		deleted,
		durationMs: duration,
	});

	return { deleted };
}

/**
 * Background cleanup job: delete entries older than retentionDays.
 * Uses global searchedAt index for efficient age-based deletion.
 */
export const cleanupOldSearchHistory = internalMutation({
	args: {
		retentionDays: v.optional(v.number()),
		batchSize: v.optional(v.number()),
	},
	returns: v.object({
		deleted: v.number(),
		cutoff: v.number(),
		durationMs: v.number(),
	}),
	handler: async (ctx, { retentionDays, batchSize }) => {
		const days = Math.max(
			0,
			Math.floor(retentionDays ?? searchHistoryConfig.retentionDays(ctx)),
		);
		const batch = Math.max(
			1,
			Math.min(
				200,
				Math.floor(batchSize ?? searchHistoryConfig.deleteBatchSize(ctx)),
			),
		);
		const cutoff = Date.now() - days * MS_IN_DAY;

		let deleted = 0;
		const start = Date.now();

		while (true) {
			const olds = await ctx.db
				.query("searchHistory")
				.withIndex("by_searchedAt", (q) => q.lte("searchedAt", cutoff))
				.order("asc")
				.take(batch);

			if (olds.length === 0) break;

			for (const doc of olds) {
				try {
					await ctx.db.delete(doc._id);
					deleted += 1;
				} catch (e) {
					// If already deleted by another concurrent worker, skip.
					console.warn("[searchHistory.cleanupOld] concurrent delete", {
						_id: doc._id,
						error: (e as Error)?.message,
					});
				}
			}

			if (olds.length < batch) break;
			// Safety time bound to avoid long-running mutation.
			if (Date.now() - start > 10000) break;
		}

		const duration = Date.now() - start;
		console.log(
			`[searchHistory.cleanupOld] cutoff=${new Date(cutoff).toISOString()} deleted=${deleted} durationMs=${duration}`,
		);

		return { deleted, cutoff, durationMs: duration };
	},
});

/**
 * Query to get all saved searches for the current user
 */
export const getUserSavedSearches = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("savedSearches"),
			name: v.string(),
			query: v.optional(v.string()),
			filters: filterSchema,
			sortBy: v.optional(
				v.union(
					v.literal("title"),
					v.literal("updatedAt"),
					v.literal("createdAt"),
					v.literal("lastAccessedAt"),
				),
			),
			sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
			userId: v.id("users"),
			createdAt: v.number(),
			updatedAt: v.number(),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx) => {
		const userId = await getCurrentUser(ctx);

		return await ctx.db
			.query("savedSearches")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();
	},
});

/**
 * Mutation to create a new saved search
 */
export const createSavedSearch = mutation({
	args: {
		name: v.string(),
		query: v.optional(v.string()),
		filters: filterSchema,
		sortBy: v.optional(
			v.union(
				v.literal("title"),
				v.literal("updatedAt"),
				v.literal("createdAt"),
				v.literal("lastAccessedAt"),
			),
		),
		sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
	},
	returns: v.id("savedSearches"),
	handler: async (ctx, { name, query, filters, sortBy, sortOrder }) => {
		const userId = await getCurrentUser(ctx);

		// Validate saved search name
		if (name.trim().length === 0) {
			throw new ConvexError("Saved search name cannot be empty");
		}
		if (name.length > 100) {
			throw new ConvexError("Saved search name cannot exceed 100 characters");
		}

		// Validate date range if provided
		if (filters?.dateRange) {
			if (filters.dateRange.start > filters.dateRange.end) {
				throw new ConvexError(
					"Invalid date range: start must be less than or equal to end",
				);
			}
		}

		// Check if user already has a saved search with this name
		const existingSearch = await ctx.db
			.query("savedSearches")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.filter((q) => q.eq(q.field("name"), name.trim()))
			.first();

		if (existingSearch) {
			throw new ConvexError("A saved search with this name already exists");
		}

		const now = Date.now();
		return await ctx.db.insert("savedSearches", {
			name: name.trim(),
			query: query?.trim() || undefined,
			filters,
			sortBy,
			sortOrder,
			userId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Mutation to update a saved search
 */
export const updateSavedSearch = mutation({
	args: {
		savedSearchId: v.id("savedSearches"),
		name: v.optional(v.string()),
		query: v.optional(v.string()),
		filters: v.optional(filterSchema),
		sortBy: v.optional(
			v.union(
				v.literal("title"),
				v.literal("updatedAt"),
				v.literal("createdAt"),
				v.literal("lastAccessedAt"),
			),
		),
		sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
	},
	returns: v.id("savedSearches"),
	handler: async (
		ctx,
		{ savedSearchId, name, query, filters, sortBy, sortOrder },
	) => {
		const userId = await getCurrentUser(ctx);

		// Check if saved search exists and belongs to user
		const savedSearch = await ctx.db.get(savedSearchId);
		if (!savedSearch) {
			throw new ConvexError("Saved search not found");
		}
		if (savedSearch.userId !== userId) {
			throw new ConvexError(
				"You don't have permission to update this saved search",
			);
		}

		// Validate name if provided
		if (name !== undefined) {
			if (name.trim().length === 0) {
				throw new ConvexError("Saved search name cannot be empty");
			}
			if (name.length > 100) {
				throw new ConvexError("Saved search name cannot exceed 100 characters");
			}

			// Check for name conflicts (excluding current search)
			const existingSearch = await ctx.db
				.query("savedSearches")
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.filter((q) =>
					q.and(
						q.eq(q.field("name"), name.trim()),
						q.neq(q.field("_id"), savedSearchId),
					),
				)
				.first();

			if (existingSearch) {
				throw new ConvexError("A saved search with this name already exists");
			}
		}

		const updates: Partial<{
			name: string;
			query: string | undefined;
			filters: {
				folderId?: Id<"folders">;
				status?: "draft" | "published" | "archived";
				tags?: string[];
				dateRange?: { start: number; end: number };
			};
			sortBy:
				| "title"
				| "updatedAt"
				| "createdAt"
				| "lastAccessedAt"
				| undefined;
			sortOrder: "asc" | "desc" | undefined;
			updatedAt: number;
		}> = {
			updatedAt: Date.now(),
		};

		if (name !== undefined) updates.name = name.trim();
		if (query !== undefined) updates.query = query;
		if (filters !== undefined) {
			// Validate date range if provided
			if (filters.dateRange) {
				if (filters.dateRange.start > filters.dateRange.end) {
					throw new ConvexError(
						"Invalid date range: start must be less than or equal to end",
					);
				}
			}
			updates.filters = filters;
		}
		if (sortBy !== undefined) updates.sortBy = sortBy;
		if (sortOrder !== undefined) updates.sortOrder = sortOrder;

		await ctx.db.patch(savedSearchId, updates);
		return savedSearchId;
	},
});

/**
 * Mutation to delete a saved search
 */
export const deleteSavedSearch = mutation({
	args: { savedSearchId: v.id("savedSearches") },
	returns: v.id("savedSearches"),
	handler: async (ctx, { savedSearchId }) => {
		const userId = await getCurrentUser(ctx);

		// Check if saved search exists and belongs to user
		const savedSearch = await ctx.db.get(savedSearchId);
		if (!savedSearch) {
			throw new ConvexError("Saved search not found");
		}
		if (savedSearch.userId !== userId) {
			throw new ConvexError(
				"You don't have permission to delete this saved search",
			);
		}

		await ctx.db.delete(savedSearchId);
		return savedSearchId;
	},
});

/**
 * Query to get recent search history for autocomplete
 */
export const getSearchHistory = query({
	args: { limit: v.optional(v.number()) },
	returns: v.array(
		v.object({
			query: v.string(),
			searchedAt: v.number(),
			resultCount: v.optional(v.number()),
		}),
	),
	handler: async (ctx, { limit = 10 }) => {
		const userId = await getCurrentUser(ctx);

		// Normalize and clamp the incoming limit to a safe integer in [1, 50].
		// Convert to number, default to 1 if NaN, drop fractional part, then clamp.
		const parsedLimit = Number(limit);
		const safeLimit = Number.isNaN(parsedLimit) ? 1 : parsedLimit;
		const clampedLimit = Math.max(1, Math.min(Math.floor(safeLimit), 50));

		const history = await ctx.db
			.query("searchHistory")
			.withIndex("by_user_searched", (q) => q.eq("userId", userId))
			.order("desc")
			.take(clampedLimit); // Cap at 50 for performance

		// Deduplicate by query, keeping most recent
		const uniqueQueries = new Map<string, (typeof history)[0]>();
		for (const item of history) {
			if (!uniqueQueries.has(item.query)) {
				uniqueQueries.set(item.query, item);
			}
		}

		// Return only the fields specified in the validator to avoid validation errors
		return Array.from(uniqueQueries.values())
			.sort((a, b) => b.searchedAt - a.searchedAt)
			.slice(0, clampedLimit)
			.map((item) => ({
				query: item.query,
				searchedAt: item.searchedAt,
				resultCount: item.resultCount,
			}));
	},
});

/**
 * Mutation to add a search to history
 */
export const addToSearchHistory = mutation({
	args: {
		query: v.string(),
		resultCount: v.optional(v.number()),
	},
	returns: v.id("searchHistory"),
	handler: async (ctx, { query, resultCount }) => {
		const userId = await getCurrentUser(ctx);

		// Validate and normalize query
		const trimmed = query.trim();
		if (trimmed.length === 0) {
			throw new ConvexError("Cannot save empty search query");
		}
		if (trimmed.length > 500) {
			throw new ConvexError("Search query too long");
		}

		const now = Date.now();
		const id = await ctx.db.insert("searchHistory", {
			query: trimmed,
			userId,
			searchedAt: now,
			resultCount,
		});

		// Enforce per-user cap. Best-effort and idempotent.
		try {
			await enforcePerUserCap(ctx, userId);
		} catch (err) {
			console.error("[searchHistory.enforcePerUserCap] error", err);
		}

		return id;
	},
});

/**
 * Mutation to clear the current user's search history
 * Provides user control for privacy.
 */
export const clearSearchHistory = mutation({
	args: {
		olderThanMs: v.optional(v.number()), // if provided, only delete entries older than this many ms from now
	},
	returns: v.object({
		deleted: v.number(),
	}),
	handler: async (ctx, { olderThanMs }) => {
		const userId = await getCurrentUser(ctx);
		const now = Date.now();
		const cutoff = olderThanMs ? now - Math.max(olderThanMs, 0) : undefined;

		let deleted = 0;

		// Iterate in batches to avoid large memory usage
		while (true) {
			const batch = await ctx.db
				.query("searchHistory")
				.withIndex("by_user_searched", (q) => q.eq("userId", userId))
				.order("asc")
				.take(200);

			if (batch.length === 0) break;

			let deletedInBatch = 0;
			for (const item of batch) {
				if (!cutoff || item.searchedAt <= cutoff) {
					await ctx.db.delete(item._id);
					deleted += 1;
					deletedInBatch += 1;
				}
			}

			// If we didn't delete anything in this batch and a cutoff is set, remaining are newer than cutoff
			if (deletedInBatch === 0 && cutoff) break;
		}

		return { deleted };
	},
});
