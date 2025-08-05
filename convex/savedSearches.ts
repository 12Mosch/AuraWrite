import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./authHelpers";

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
			query,
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

		const history = await ctx.db
			.query("searchHistory")
			.withIndex("by_user_searched", (q) => q.eq("userId", userId))
			.order("desc")
			.take(Math.min(limit, 50)); // Cap at 50 for performance

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
			.slice(0, limit)
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

		// Don't save empty queries
		if (query.trim().length === 0) {
			throw new ConvexError("Cannot save empty search query");
		}

		// Limit query length
		if (query.length > 500) {
			throw new ConvexError("Search query too long");
		}

		// TODO: Retention policy: periodically delete old searchHistory entries beyond N days.
		// This can be implemented via a Convex cron or scheduled function.

		return await ctx.db.insert("searchHistory", {
			query: query.trim(),
			userId,
			searchedAt: Date.now(),
			resultCount,
		});
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
				.order("desc")
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
			// If fewer than batch size returned, we've reached the end
			if (batch.length < 200 && !cutoff) break;
		}

		return { deleted };
	},
});
