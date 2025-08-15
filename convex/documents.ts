import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import {
	checkDocumentAccess,
	checkFolderAccess,
	getCurrentUser,
} from "./authHelpers";

// Helper function to check document edit permissions
async function checkDocumentEditAccess(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
	userId: Id<"users">,
): Promise<Doc<"documents">> {
	const document = await ctx.db.get(documentId);
	if (!document) {
		throw new ConvexError("Document not found");
	}

	const canEdit =
		document.ownerId === userId || document.collaborators?.includes(userId);

	if (!canEdit) {
		throw new ConvexError(
			"Access denied: You don't have permission to edit this document",
		);
	}

	return document;
}

// Helper function to check document owner permissions
async function checkDocumentOwnerAccess(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
	userId: Id<"users">,
): Promise<Doc<"documents">> {
	const document = await ctx.db.get(documentId);
	if (!document) {
		throw new ConvexError("Document not found");
	}

	if (document.ownerId !== userId) {
		throw new ConvexError(
			"Access denied: Only the document owner can perform this action",
		);
	}

	return document;
}

// Query to get all documents for the current user
export const getUserDocuments = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			yjsState: v.optional(v.bytes()),
			yjsStateVector: v.optional(v.bytes()),
			yjsUpdatedAt: v.optional(v.number()),
			ownerId: v.id("users"),
			isPublic: v.optional(v.boolean()),
			collaborators: v.optional(v.array(v.id("users"))),
			createdAt: v.number(),
			updatedAt: v.number(),
			tags: v.optional(v.array(v.string())),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			templateId: v.optional(v.id("templates")),
			lastAccessedAt: v.optional(v.number()),
			isFavorite: v.optional(v.boolean()),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx) => {
		const userId = await getCurrentUser(ctx);

		return await ctx.db
			.query("documents")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.order("desc")
			.collect();
	},
});

// Query to get a specific document by ID
export const getDocument = query({
	args: { documentId: v.id("documents") },
	returns: v.union(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			yjsState: v.optional(v.bytes()),
			yjsStateVector: v.optional(v.bytes()),
			yjsUpdatedAt: v.optional(v.number()),
			ownerId: v.id("users"),
			isPublic: v.optional(v.boolean()),
			collaborators: v.optional(v.array(v.id("users"))),
			createdAt: v.number(),
			updatedAt: v.number(),
			tags: v.optional(v.array(v.string())),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			templateId: v.optional(v.id("templates")),
			lastAccessedAt: v.optional(v.number()),
			isFavorite: v.optional(v.boolean()),
			_creationTime: v.number(),
		}),
		v.null(),
	),
	handler: async (ctx, { documentId }) => {
		try {
			const userId = await getCurrentUser(ctx);
			return await checkDocumentAccess(ctx, documentId, userId);
		} catch (error: unknown) {
			const isExpected = (err: unknown) => {
				if (err instanceof ConvexError) {
					const data = err.data;
					const msg = typeof data === "string" ? data : (err.message ?? "");
					return /not found|access denied/i.test(String(msg));
				}
				if (err instanceof Error)
					return /not found|access denied/i.test(err.message);
				if (typeof err === "string")
					return /not found|access denied/i.test(err);
				return false;
			};
			if (isExpected(error)) {
				console.info(
					`Document access expected failure for ${documentId}:`,
					error,
				);
				return null;
			}
			console.error(`Unexpected error fetching document ${documentId}:`, error);
			throw error;
		}
	},
});

// Query to get document data for recovery purposes (includes Y.js state)
export const getDocumentForRecovery = query({
	args: { documentId: v.id("documents") },
	returns: v.union(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			yjsState: v.optional(v.bytes()),
			yjsStateVector: v.optional(v.bytes()),
			ownerId: v.id("users"),
			isPublic: v.optional(v.boolean()),
			collaborators: v.optional(v.array(v.id("users"))),
			createdAt: v.number(),
			updatedAt: v.number(),
			yjsUpdatedAt: v.optional(v.number()),
			tags: v.optional(v.array(v.string())),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			templateId: v.optional(v.id("templates")),
			lastAccessedAt: v.optional(v.number()),
			isFavorite: v.optional(v.boolean()),
			_creationTime: v.number(),
		}),
		v.null(),
	),
	handler: async (ctx, { documentId }) => {
		try {
			const userId = await getCurrentUser(ctx);
			return await checkDocumentAccess(ctx, documentId, userId);
		} catch (error: unknown) {
			const isExpected = (err: unknown) => {
				if (err instanceof ConvexError) {
					const data = err.data;
					const msg = typeof data === "string" ? data : (err.message ?? "");
					return /not found|access denied/i.test(String(msg));
				}
				if (err instanceof Error)
					return /not found|access denied/i.test(err.message);
				if (typeof err === "string")
					return /not found|access denied/i.test(err);
				return false;
			};
			if (isExpected(error)) {
				console.info(
					`Document recovery expected failure for ${documentId}:`,
					error,
				);
				return null;
			}
			console.error(
				`Unexpected error fetching document for recovery ${documentId}:`,
				error,
			);
			throw error;
		}
	},
});

// Mutation to create a new document
export const createDocument = mutation({
	args: {
		title: v.string(),
		content: v.optional(v.string()),
		isPublic: v.optional(v.boolean()),
		folderId: v.optional(v.id("folders")),
	},
	returns: v.id("documents"),
	handler: async (ctx, { title, content, isPublic, folderId }) => {
		const userId = await getCurrentUser(ctx);

		// Validate title length
		if (title.trim().length === 0) {
			throw new ConvexError("Document title cannot be empty");
		}
		if (title.length > 200) {
			throw new ConvexError("Document title cannot exceed 200 characters");
		}

		// Validate content if provided
		if (content !== undefined && content.length > 1000000) {
			throw new ConvexError("Document content cannot exceed 1MB");
		}

		// Validate folder access if provided
		if (folderId) {
			await checkFolderAccess(ctx, folderId, userId);
		}

		const now = Date.now();
		return await ctx.db.insert("documents", {
			title: title.trim(),
			content:
				content ||
				JSON.stringify([{ type: "paragraph", children: [{ text: "" }] }]),
			ownerId: userId,
			isPublic: isPublic || false,
			collaborators: [],
			folderId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

// Mutation to update a document
// Note: `filePath` is no longer a field on the global `documents` table (to avoid leaking per-user filesystem paths).
// Per-user local paths should be stored in the `documentLocalPaths` table via dedicated mutations below.
export const updateDocument = mutation({
	args: {
		documentId: v.id("documents"),
		title: v.optional(v.string()),
		content: v.optional(v.string()),
		isPublic: v.optional(v.boolean()),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, title, content, isPublic }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentEditAccess(ctx, documentId, userId);

		// Validate title if provided
		if (title !== undefined) {
			if (title.trim().length === 0) {
				throw new ConvexError("Document title cannot be empty");
			}
			if (title.length > 200) {
				throw new ConvexError("Document title cannot exceed 200 characters");
			}
		}

		// Validate content if provided
		if (content !== undefined && content.length > 1000000) {
			throw new ConvexError("Document content cannot exceed 1MB");
		}

		const updates: Partial<{
			title: string;
			content: string;
			isPublic: boolean;
			updatedAt: number;
		}> = {
			updatedAt: Date.now(),
		};

		if (title !== undefined) updates.title = title.trim();
		if (content !== undefined) updates.content = content;
		if (isPublic !== undefined) updates.isPublic = isPublic;

		await ctx.db.patch(documentId, updates);
		return documentId;
	},
});

/**
 * Mutation to set or update the calling user's local file path for a document.
 *
 * - Stores per-user paths in `documentLocalPaths` keyed by (userId, documentId).
 * - Only the calling user may set their own path. Any user with edit access may set their own path.
 * - Clients may instead choose to keep paths client-only and never call this mutation.
 */
export const setUserDocumentLocalPath = mutation({
	args: {
		documentId: v.id("documents"),
		filePath: v.string(),
	},
	returns: v.id("documentLocalPaths"),
	handler: async (ctx, { documentId, filePath }) => {
		const userId = await getCurrentUser(ctx);

		// Ensure the user has access to the document (owner or collaborator or public read)
		// We require at least edit access to associate a local path with a document.
		await checkDocumentEditAccess(ctx, documentId, userId);

		const now = Date.now();

		// Normalize/validate filePath
		const trimmed = filePath.trim();
		if (trimmed.length === 0) {
			throw new ConvexError("filePath cannot be empty");
		}
		if (trimmed.length > 2048) {
			throw new ConvexError("filePath exceeds maximum length");
		}
		const normalized: string = trimmed;

		// Compute deterministic composite key for (userId, documentId) so concurrent writes collide.
		const compositeKey = `${String(userId)}|${String(documentId)}`;

		// Look for existing mapping for this user/document using the synthetic composite key index
		const found = await ctx.db
			.query("documentLocalPaths")
			.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
			.collect();

		// If exactly one row exists, patch it and return its id
		if (found.length === 1) {
			await ctx.db.patch(found[0]._id, {
				filePath: normalized,
				updatedAt: now,
			});
			return found[0]._id as Id<"documentLocalPaths">;
		}

		// If none exist, attempt to insert and then re-query the index to confirm
		if (found.length === 0) {
			const insertedId = await ctx.db.insert("documentLocalPaths", {
				documentId,
				userId,
				compositeKey,
				filePath: normalized,
				createdAt: now,
				updatedAt: now,
			});

			// Re-query with the composite index to detect races
			const afterInsert = await ctx.db
				.query("documentLocalPaths")
				.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
				.collect();

			// If only one row exists after insert, return it (might be the one we inserted or another)
			if (afterInsert.length === 1) {
				const row = afterInsert[0];
				// Ensure the surviving row has the expected filePath and timestamp
				await ctx.db.patch(row._id, {
					// ensure compositeKey persists (no-op if already present)
					compositeKey,
					filePath: normalized,
					updatedAt: now,
				});
				return row._id as Id<"documentLocalPaths">;
			}

			// If multiple rows exist (race), pick one deterministically to keep and delete the rest
			if (afterInsert.length > 1) {
				// Prefer keeping a row that matches the insertedId if present; otherwise keep the first
				const survivor =
					afterInsert.find((r) => r._id === insertedId) || afterInsert[0];
				// Patch the survivor to ensure correct values
				await ctx.db.patch(survivor._id, {
					compositeKey,
					filePath: normalized,
					updatedAt: now,
				});
				// Delete extras
				for (const r of afterInsert) {
					if (r._id !== survivor._id) {
						await ctx.db.delete(r._id);
					}
				}
				return survivor._id as Id<"documentLocalPaths">;
			}

			// Fallback: if we couldn't observe any rows after insert, throw to avoid returning undefined
			if (insertedId) {
				// As a conservative fallback, return the insertedId after patching it to ensure consistency
				await ctx.db.patch(insertedId, {
					compositeKey,
					filePath: normalized,
					updatedAt: now,
				});
				return insertedId as Id<"documentLocalPaths">;
			}
			throw new ConvexError(
				"Failed to create or reconcile documentLocalPaths entry",
			);
		}

		// If multiple rows were found initially (rare), resolve by keeping one and deleting the extras
		if (found.length > 1) {
			// Keep the first as survivor and patch it
			const survivor = found[0];
			await ctx.db.patch(survivor._id, {
				compositeKey,
				filePath: normalized,
				updatedAt: now,
			});
			// Delete the others
			for (const r of found.slice(1)) {
				await ctx.db.delete(r._id);
			}
			return survivor._id as Id<"documentLocalPaths">;
		}

		// Shouldn't reach here; ensure we never return undefined
		throw new ConvexError(
			"Failed to locate or create documentLocalPaths entry",
		);
	},
});

/**
 * Mutation to clear the calling user's stored local file path for a document.
 * This deletes the per-user mapping if present.
 */
export const clearUserDocumentLocalPath = mutation({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.union(v.id("documentLocalPaths"), v.null()),
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentEditAccess(ctx, documentId, userId);

		const compositeKey = `${String(userId)}|${String(documentId)}`;

		// Fetch all mappings for this (userId, documentId) composite key so we can
		// remove duplicates if they exist.
		const existing = await ctx.db
			.query("documentLocalPaths")
			.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
			.collect();

		if (existing.length === 0) return null;

		// Delete all matching rows to clean up any duplicates; return one of the
		// deleted ids as a reference for the caller.
		for (const row of existing) {
			await ctx.db.delete(row._id);
		}
		return existing[0]._id;
	},
});

// Mutation to delete a document
export const deleteDocument = mutation({
	args: { documentId: v.id("documents") },
	returns: v.id("documents"),
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentOwnerAccess(ctx, documentId, userId);

		// Delete related document versions first to maintain referential integrity
		const versions = await ctx.db
			.query("documentVersions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();

		for (const version of versions) {
			await ctx.db.delete(version._id);
		}

		// Delete collaboration sessions
		const sessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();

		for (const session of sessions) {
			await ctx.db.delete(session._id);
		}

		// Delete per-user local paths for this document
		const localPaths = await ctx.db
			.query("documentLocalPaths")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", userId).eq("documentId", documentId),
			)
			.collect();
		for (const lp of localPaths) {
			await ctx.db.delete(lp._id);
		}

		// Finally delete the document
		await ctx.db.delete(documentId);
		return documentId;
	},
});

// Mutation to add a collaborator to a document
export const addCollaborator = mutation({
	args: {
		documentId: v.id("documents"),
		collaboratorId: v.id("users"),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, collaboratorId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentOwnerAccess(ctx, documentId, userId);

		// Check if the collaborator user exists
		const collaboratorUser = await ctx.db.get(collaboratorId);
		if (!collaboratorUser) {
			throw new ConvexError("Collaborator user not found");
		}

		// Prevent adding owner as collaborator
		if (collaboratorId === userId) {
			throw new ConvexError("Cannot add document owner as collaborator");
		}

		const currentCollaborators = document.collaborators || [];
		if (currentCollaborators.includes(collaboratorId)) {
			throw new ConvexError("User is already a collaborator on this document");
		}

		await ctx.db.patch(documentId, {
			collaborators: [...currentCollaborators, collaboratorId],
			updatedAt: Date.now(),
		});

		return documentId;
	},
});

// Mutation to remove a collaborator from a document
export const removeCollaborator = mutation({
	args: {
		documentId: v.id("documents"),
		collaboratorId: v.id("users"),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, collaboratorId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentOwnerAccess(ctx, documentId, userId);

		const currentCollaborators = document.collaborators || [];
		if (!currentCollaborators.includes(collaboratorId)) {
			throw new ConvexError("User is not a collaborator on this document");
		}

		await ctx.db.patch(documentId, {
			collaborators: currentCollaborators.filter((id) => id !== collaboratorId),
			updatedAt: Date.now(),
		});

		// Clean up any active collaboration sessions for this user
		const sessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", collaboratorId).eq("documentId", documentId),
			)
			.collect();

		for (const session of sessions) {
			await ctx.db.delete(session._id);
		}

		return documentId;
	},
});

// Mutation to duplicate a document
export const duplicateDocument = mutation({
	args: {
		documentId: v.id("documents"),
		title: v.optional(v.string()),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, title }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		// Validate new title if provided
		const newTitle = title || `Copy of ${document.title}`;
		if (newTitle.trim().length === 0) {
			throw new ConvexError("Document title cannot be empty");
		}
		if (newTitle.length > 200) {
			throw new ConvexError("Document title cannot exceed 200 characters");
		}

		const now = Date.now();
		return await ctx.db.insert("documents", {
			title: newTitle.trim(),
			content:
				document.content ||
				JSON.stringify([{ type: "paragraph", children: [{ text: "" }] }]),
			ownerId: userId,
			isPublic: false, // New document is private by default
			collaborators: [],
			createdAt: now,
			updatedAt: now,
		});
	},
});

// Mutation to update document visibility (public/private)
export const updateDocumentVisibility = mutation({
	args: {
		documentId: v.id("documents"),
		isPublic: v.boolean(),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, isPublic }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentOwnerAccess(ctx, documentId, userId);

		await ctx.db.patch(documentId, {
			isPublic,
			updatedAt: Date.now(),
		});

		return documentId;
	},
});

// Mutation to transfer document ownership
export const transferDocumentOwnership = mutation({
	args: {
		documentId: v.id("documents"),
		newOwnerId: v.id("users"),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, newOwnerId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentOwnerAccess(ctx, documentId, userId);

		// Check if the new owner user exists
		const newOwnerUser = await ctx.db.get(newOwnerId);
		if (!newOwnerUser) {
			throw new ConvexError("New owner user not found");
		}

		// Prevent transferring to the same owner
		if (newOwnerId === userId) {
			throw new ConvexError("Cannot transfer ownership to the same user");
		}

		// Remove new owner from collaborators if they were one
		const currentCollaborators = document.collaborators || [];
		const updatedCollaborators = currentCollaborators.filter(
			(id) => id !== newOwnerId,
		);

		await ctx.db.patch(documentId, {
			ownerId: newOwnerId,
			collaborators: updatedCollaborators,
			updatedAt: Date.now(),
		});

		return documentId;
	},
});

// Sprint 1 additions - Enhanced document queries and mutations

/**
 * Query to return the distinct set of tags available to the current user.
 * This will be used by the FilterPanel to present dynamic tag options.
 */
export const getAvailableTags = query({
	args: {},
	returns: v.array(v.string()),
	handler: async (ctx) => {
		const userId = await getCurrentUser(ctx);

		// Fetch all documents owned by the user. We use by_owner index for DB-level filtering.
		const docs = await ctx.db
			.query("documents")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();

		// Aggregate unique tags
		const tagSet = new Set<string>();
		for (const d of docs) {
			if (d.tags?.length) {
				for (const t of d.tags) {
					const trimmed = t.trim();
					if (trimmed.length > 0) tagSet.add(trimmed);
				}
			}
		}

		return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
	},
});

/**
 * Query to search documents with filters, DB-level indexing, and pagination
 */
export const searchDocuments = query({
	args: {
		query: v.optional(v.string()),
		folderId: v.optional(v.id("folders")),
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("published"),
				v.literal("archived"),
			),
		),
		tags: v.optional(v.array(v.string())),
		sortBy: v.optional(
			v.union(
				v.literal("title"),
				v.literal("updatedAt"),
				v.literal("createdAt"),
				v.literal("lastAccessedAt"),
			),
		),
		sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
		limit: v.optional(v.number()),
		offset: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			yjsState: v.optional(v.bytes()),
			yjsStateVector: v.optional(v.bytes()),
			yjsUpdatedAt: v.optional(v.number()),
			ownerId: v.id("users"),
			isPublic: v.optional(v.boolean()),
			collaborators: v.optional(v.array(v.id("users"))),
			createdAt: v.number(),
			updatedAt: v.number(),
			tags: v.optional(v.array(v.string())),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			templateId: v.optional(v.id("templates")),
			lastAccessedAt: v.optional(v.number()),
			isFavorite: v.optional(v.boolean()),
			_creationTime: v.number(),
		}),
	),
	handler: async (
		ctx,
		{
			query,
			folderId,
			status,
			tags,
			sortBy = "updatedAt",
			sortOrder = "desc",
			limit = 50,
			offset = 0,
		},
	) => {
		const userId = await getCurrentUser(ctx);

		// We prefer DB-level filtering using indexes and search indexes.
		// Strategy:
		// 1) If query is provided, use search index "search_title" with ownerId filter and optional folder/status.
		// 2) Else, use the most selective compound index available among:
		//    - by_folder_owner when folderId present
		//    - by_owner_status when status present
		//    - by_owner fallback
		// 3) Tag filter is applied in-memory because there is no tags index in schema.
		// 4) Sorting: if sorting by updatedAt/createdAt/lastAccessedAt, we can partially leverage indexes,
		//    but to keep correctness with multi-field filters, we sort in-memory after fetching a bounded page.
		// 5) Pagination via offset/limit applied after sorting.

		let baseResults: Doc<"documents">[] = [];

		// If text search provided, leverage search index
		if (query && query.trim().length > 0) {
			const search = query.trim();

			// Use the search index with filters; Convex searchIndex supports search + filterFields
			// Note: We must still check access control for shared/public docs; however this search is user-centric,
			// using ownerId filter to only fetch user's own docs. This mirrors previous behavior which scoped to owner.
			const searchQuery = ctx.db
				.query("documents")
				.withSearchIndex("search_title", (q) => {
					let builder = q.search("title", search).eq("ownerId", userId);
					if (folderId !== undefined)
						builder = builder.eq("folderId", folderId);
					if (status !== undefined) builder = builder.eq("status", status);
					return builder;
				});

			// Collect a generous slice to allow for post-sort and pagination.
			baseResults = await searchQuery.collect();
		} else {
			// No text search; use best-fitting indexes
			if (folderId !== undefined) {
				// by_folder_owner(folderId, ownerId)
				baseResults = await ctx.db
					.query("documents")
					.withIndex("by_folder_owner", (q) =>
						q.eq("folderId", folderId).eq("ownerId", userId),
					)
					.collect();
			} else if (status !== undefined) {
				// by_owner_status(ownerId, status)
				baseResults = await ctx.db
					.query("documents")
					.withIndex("by_owner_status", (q) =>
						q.eq("ownerId", userId).eq("status", status),
					)
					.collect();
			} else {
				// owner scope
				baseResults = await ctx.db
					.query("documents")
					.withIndex("by_owner", (q) => q.eq("ownerId", userId))
					.collect();
			}
		}

		// Apply tag filter in-memory (no index on tags)
		let filtered = baseResults;
		if (tags && tags.length > 0) {
			const tagSet = new Set(tags);
			filtered = filtered.filter((doc) => {
				if (!doc.tags || doc.tags.length === 0) return false;
				for (const t of doc.tags) {
					if (tagSet.has(t)) return true;
				}
				return false;
			});
		}

		// Sorting
		filtered.sort((a, b) => {
			let aValue: number | string;
			let bValue: number | string;

			switch (sortBy) {
				case "title":
					aValue = a.title.toLowerCase();
					bValue = b.title.toLowerCase();
					break;
				case "createdAt":
					aValue = a.createdAt;
					bValue = b.createdAt;
					break;
				case "lastAccessedAt":
					aValue = a.lastAccessedAt || 0;
					bValue = b.lastAccessedAt || 0;
					break;
				default:
					aValue = a.updatedAt;
					bValue = b.updatedAt;
			}

			if (sortOrder === "asc") {
				return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
			} else {
				return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
			}
		});

		// Pagination via offset/limit
		const start = Math.max(0, offset);
		const end = start + Math.max(0, limit);
		return filtered.slice(start, end);
	},
});

/**
 * Query to get documents by folder
 */
export const getDocumentsByFolder = query({
	args: {
		folderId: v.optional(v.id("folders")),
		limit: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			yjsState: v.optional(v.bytes()),
			yjsStateVector: v.optional(v.bytes()),
			yjsUpdatedAt: v.optional(v.number()),
			ownerId: v.id("users"),
			isPublic: v.optional(v.boolean()),
			collaborators: v.optional(v.array(v.id("users"))),
			createdAt: v.number(),
			updatedAt: v.number(),
			tags: v.optional(v.array(v.string())),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			templateId: v.optional(v.id("templates")),
			lastAccessedAt: v.optional(v.number()),
			isFavorite: v.optional(v.boolean()),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx, { folderId, limit = 50 }) => {
		const userId = await getCurrentUser(ctx);

		let documents: Doc<"documents">[];

		if (folderId) {
			// Get documents in specific folder with DB-level access filtering for owner documents
			// First, fetch documents owned by the user in the folder via compound index
			const ownedInFolder = await ctx.db
				.query("documents")
				.withIndex("by_folder_owner", (q) =>
					q.eq("folderId", folderId).eq("ownerId", userId),
				)
				.collect();

			// Next, fetch public or collaborator-accessible docs in the same folder.
			// There is no index supporting (folderId, isPublic) or (folderId, collaborators),
			// so we must scan by folder and filter in-memory for those cases only.
			// This keeps the large owner set filtered at DB level.
			const othersInFolder = await ctx.db
				.query("documents")
				.withIndex("by_folder", (q) => q.eq("folderId", folderId))
				.collect();

			// Merge: include public or collaborated docs not owned by the user
			const accessibleNonOwned = othersInFolder.filter(
				(doc) =>
					doc.ownerId !== userId &&
					(doc.isPublic === true || doc.collaborators?.includes(userId)),
			);

			// Combine while avoiding duplicates
			const map = new Map(ownedInFolder.map((d) => [d._id, d]));
			for (const d of accessibleNonOwned) map.set(d._id, d);
			documents = Array.from(map.values());
		} else {
			// Get documents not in any folder (root level)
			const ownedRoot = await ctx.db
				.query("documents")
				.withIndex("by_owner", (q) => q.eq("ownerId", userId))
				.collect();

			// Owned root-level docs
			const ownedRootFiltered = ownedRoot.filter((doc) => !doc.folderId);

			// Public or collaborator root-level docs require additional filtering.
			// Convex optional index equality: use q.eq("folderId", undefined) to target root-level (no folder).
			const byNoFolder = await ctx.db
				.query("documents")
				.withIndex("by_folder", (q) => q.eq("folderId", undefined))
				.collect();

			const accessibleNonOwnedRoot = byNoFolder.filter(
				(doc) =>
					doc.ownerId !== userId &&
					(doc.isPublic === true || doc.collaborators?.includes(userId)),
			);

			const map = new Map(ownedRootFiltered.map((d) => [d._id, d]));
			for (const d of accessibleNonOwnedRoot) map.set(d._id, d);
			documents = Array.from(map.values());
		}

		// Sort by updated date (newest first)
		documents.sort((a, b) => b.updatedAt - a.updatedAt);

		return documents.slice(0, limit);
	},
});

/**
 * Query to get recent documents
 */
export const getRecentDocuments = query({
	args: {
		limit: v.optional(v.number()),
		days: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			yjsState: v.optional(v.bytes()),
			yjsStateVector: v.optional(v.bytes()),
			yjsUpdatedAt: v.optional(v.number()),
			ownerId: v.id("users"),
			isPublic: v.optional(v.boolean()),
			collaborators: v.optional(v.array(v.id("users"))),
			createdAt: v.number(),
			updatedAt: v.number(),
			tags: v.optional(v.array(v.string())),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			templateId: v.optional(v.id("templates")),
			lastAccessedAt: v.optional(v.number()),
			isFavorite: v.optional(v.boolean()),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx, { limit = 10, days = 7 }) => {
		const userId = await getCurrentUser(ctx);
		const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();

		// Filter by recent activity (updated or accessed)
		const recentDocuments = documents.filter((doc) => {
			const lastActivity = Math.max(
				doc.updatedAt,
				doc.lastAccessedAt || 0,
				doc.yjsUpdatedAt || 0,
			);
			return lastActivity > cutoffTime;
		});

		// Sort by most recent activity
		recentDocuments.sort((a, b) => {
			const aActivity = Math.max(
				a.updatedAt,
				a.lastAccessedAt || 0,
				a.yjsUpdatedAt || 0,
			);
			const bActivity = Math.max(
				b.updatedAt,
				b.lastAccessedAt || 0,
				b.yjsUpdatedAt || 0,
			);
			return bActivity - aActivity;
		});

		return recentDocuments.slice(0, limit);
	},
});

/**
 * Query to get favorite documents
 */
export const getFavoriteDocuments = query({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			yjsState: v.optional(v.bytes()),
			yjsStateVector: v.optional(v.bytes()),
			yjsUpdatedAt: v.optional(v.number()),
			ownerId: v.id("users"),
			isPublic: v.optional(v.boolean()),
			collaborators: v.optional(v.array(v.id("users"))),
			createdAt: v.number(),
			updatedAt: v.number(),
			tags: v.optional(v.array(v.string())),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			templateId: v.optional(v.id("templates")),
			lastAccessedAt: v.optional(v.number()),
			isFavorite: v.optional(v.boolean()),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx, { limit = 50 }) => {
		const userId = await getCurrentUser(ctx);

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_favorite", (q) =>
				q.eq("ownerId", userId).eq("isFavorite", true),
			)
			.order("desc")
			.collect();

		return documents.slice(0, limit);
	},
});

/**
 * Query to get documents by status
 */
export const getDocumentsByStatus = query({
	args: {
		status: v.union(
			v.literal("draft"),
			v.literal("published"),
			v.literal("archived"),
		),
		limit: v.optional(v.number()),
		offset: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			yjsState: v.optional(v.bytes()),
			yjsStateVector: v.optional(v.bytes()),
			yjsUpdatedAt: v.optional(v.number()),
			ownerId: v.id("users"),
			isPublic: v.optional(v.boolean()),
			collaborators: v.optional(v.array(v.id("users"))),
			createdAt: v.number(),
			updatedAt: v.number(),
			tags: v.optional(v.array(v.string())),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			templateId: v.optional(v.id("templates")),
			lastAccessedAt: v.optional(v.number()),
			isFavorite: v.optional(v.boolean()),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx, { status, limit = 50, offset = 0 }) => {
		const userId = await getCurrentUser(ctx);

		// Bounded window prevents unbounded scans even with large offsets.
		const safeLimit = Math.max(1, Math.min(100, limit));
		const safeOffset = Math.max(0, offset);
		const MAX_WINDOW = 500;
		const window = Math.min(MAX_WINDOW, safeOffset + safeLimit);

		// 1) Owned docs: leverage compound index (ownerId, status)
		const owned = await ctx.db
			.query("documents")
			.withIndex("by_owner_status", (q) =>
				q.eq("ownerId", userId).eq("status", status),
			)
			.order("desc")
			.take(window);

		// 2) Public or collaborated docs: narrow by status first, then access-filter
		const statusMatched = await ctx.db
			.query("documents")
			.withIndex("by_status", (q) => q.eq("status", status))
			.order("desc")
			.take(window);

		const accessibleNonOwned = statusMatched.filter(
			(doc) => doc.isPublic === true || doc.collaborators?.includes(userId),
		);

		// Merge and de-duplicate by _id
		const merged = new Map(owned.map((d) => [d._id, d]));
		for (const d of accessibleNonOwned) merged.set(d._id, d);

		// Safety net: enforce access constraints
		const results = Array.from(merged.values()).filter(
			(doc) =>
				doc.ownerId === userId ||
				doc.isPublic === true ||
				doc.collaborators?.includes(userId),
		);

		// Business-level ordering: most recently updated first
		results.sort((a, b) => b.updatedAt - a.updatedAt);

		// Offset/limit pagination on merged results
		const start = safeOffset;
		const end = start + safeLimit;
		return results.slice(start, end);
	},
});

// Sprint 1 mutations for enhanced document management

/**
 * Mutation to update document tags
 */
export const updateDocumentTags = mutation({
	args: {
		documentId: v.id("documents"),
		tags: v.array(v.string()),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, tags }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentEditAccess(ctx, documentId, userId);

		// Validate tags
		if (tags.length > 20) {
			throw new ConvexError("Document cannot have more than 20 tags");
		}

		for (const tag of tags) {
			if (tag.trim().length === 0) {
				throw new ConvexError("Tags cannot be empty");
			}
			if (tag.length > 50) {
				throw new ConvexError("Tag cannot exceed 50 characters");
			}
		}

		// Remove duplicates and trim tags
		const cleanTags = [...new Set(tags.map((tag) => tag.trim()))];

		await ctx.db.patch(documentId, {
			tags: cleanTags,
			updatedAt: Date.now(),
		});

		return documentId;
	},
});

/**
 * Mutation to update document status
 */
export const updateDocumentStatus = mutation({
	args: {
		documentId: v.id("documents"),
		status: v.union(
			v.literal("draft"),
			v.literal("published"),
			v.literal("archived"),
		),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, status }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentEditAccess(ctx, documentId, userId);

		await ctx.db.patch(documentId, {
			status,
			updatedAt: Date.now(),
		});

		return documentId;
	},
});

/**
 * Mutation to move document to folder
 */
export const moveDocumentToFolder = mutation({
	args: {
		documentId: v.id("documents"),
		folderId: v.optional(v.id("folders")),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId, folderId }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentEditAccess(ctx, documentId, userId);

		// Validate folder if provided using shared access helper
		if (folderId) {
			await checkFolderAccess(ctx, folderId, userId);
		}

		await ctx.db.patch(documentId, {
			folderId,
			updatedAt: Date.now(),
		});

		return documentId;
	},
});

/**
 * Mutation to toggle document favorite status
 */
export const toggleDocumentFavorite = mutation({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		await ctx.db.patch(documentId, {
			isFavorite: !document.isFavorite,
			updatedAt: Date.now(),
		});

		return documentId;
	},
});

/**
 * Mutation to update document last accessed time
 */
export const updateDocumentLastAccessed = mutation({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.id("documents"),
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentAccess(ctx, documentId, userId);

		await ctx.db.patch(documentId, {
			lastAccessedAt: Date.now(),
		});

		return documentId;
	},
});

/**
 * Mutation to bulk update documents
 */
export const bulkUpdateDocuments = mutation({
	args: {
		documentIds: v.array(v.id("documents")),
		updates: v.object({
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			folderId: v.optional(v.id("folders")),
			tags: v.optional(v.array(v.string())),
			isFavorite: v.optional(v.boolean()),
		}),
	},
	returns: v.object({
		successes: v.array(v.id("documents")),
		failures: v.array(
			v.object({
				documentId: v.id("documents"),
				error: v.string(),
			}),
		),
	}),
	handler: async (ctx, { documentIds, updates }) => {
		const userId = await getCurrentUser(ctx);

		// Validate document count
		if (documentIds.length === 0) {
			throw new ConvexError("No documents specified for bulk update");
		}
		if (documentIds.length > 100) {
			throw new ConvexError(
				"Cannot bulk update more than 100 documents at once",
			);
		}

		// Validate folder if provided
		if (updates.folderId) {
			// Use shared access helper
			await checkFolderAccess(ctx, updates.folderId, userId);
		}

		// Validate tags if provided
		if (updates.tags) {
			if (updates.tags.length > 20) {
				throw new ConvexError("Document cannot have more than 20 tags");
			}
			for (const tag of updates.tags) {
				if (tag.trim().length === 0) {
					throw new ConvexError("Tags cannot be empty");
				}
				if (tag.length > 50) {
					throw new ConvexError("Tag cannot exceed 50 characters");
				}
			}
		}

		const successes: Id<"documents">[] = [];
		const failures: { documentId: Id<"documents">; error: string }[] = [];
		const now = Date.now();

		// Process each document
		for (const documentId of documentIds) {
			try {
				await checkDocumentEditAccess(ctx, documentId, userId);

				const patchData: Partial<{
					status: "draft" | "published" | "archived";
					folderId: Id<"folders"> | undefined;
					tags: string[];
					isFavorite: boolean;
					updatedAt: number;
				}> = {
					updatedAt: now,
				};

				if (updates.status !== undefined) patchData.status = updates.status;
				if (updates.folderId !== undefined)
					patchData.folderId = updates.folderId;
				if (updates.tags !== undefined) {
					patchData.tags = [...new Set(updates.tags.map((tag) => tag.trim()))];
				}
				if (updates.isFavorite !== undefined)
					patchData.isFavorite = updates.isFavorite;

				await ctx.db.patch(documentId, patchData);
				successes.push(documentId);
			} catch (error: unknown) {
				const message =
					error instanceof ConvexError
						? String(error.data ?? error.message ?? "ConvexError")
						: error instanceof Error
							? error.message
							: typeof error === "string"
								? error
								: "Unknown error";
				console.warn(`Failed to update document ${documentId}:`, error);
				failures.push({ documentId, error: message });
			}
		}

		return { successes, failures };
	},
});

/**
 * Mutation to archive documents (set status to archived)
 */
export const archiveDocuments = mutation({
	args: {
		documentIds: v.array(v.id("documents")),
	},
	returns: v.object({
		successes: v.array(v.id("documents")),
		failures: v.array(
			v.object({
				documentId: v.id("documents"),
				error: v.string(),
			}),
		),
	}),
	handler: async (ctx, { documentIds }) => {
		const userId = await getCurrentUser(ctx);

		// Validate document count
		if (documentIds.length === 0) {
			throw new ConvexError("No documents specified for archiving");
		}
		if (documentIds.length > 100) {
			throw new ConvexError("Cannot archive more than 100 documents at once");
		}

		const successes: Id<"documents">[] = [];
		const failures: { documentId: Id<"documents">; error: string }[] = [];
		const now = Date.now();

		// Process each document
		for (const documentId of documentIds) {
			try {
				await checkDocumentEditAccess(ctx, documentId, userId);

				await ctx.db.patch(documentId, {
					status: "archived",
					updatedAt: now,
				});

				successes.push(documentId);
			} catch (error: unknown) {
				const message =
					error instanceof ConvexError
						? String(error.data ?? error.message ?? "ConvexError")
						: error instanceof Error
							? error.message
							: typeof error === "string"
								? error
								: "Unknown error";
				console.warn(`Failed to archive document ${documentId}:`, error);
				failures.push({ documentId, error: message });
			}
		}

		return { successes, failures };
	},
});
