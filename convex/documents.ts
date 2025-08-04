import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { checkDocumentAccess, getCurrentUser } from "./authHelpers";

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
	returns: v.object({
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
		_creationTime: v.number(),
	}),
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		return await checkDocumentAccess(ctx, documentId, userId);
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
			_creationTime: v.number(),
		}),
		v.null(),
	),
	handler: async (ctx, { documentId }) => {
		try {
			const userId = await getCurrentUser(ctx);
			return await checkDocumentAccess(ctx, documentId, userId);
		} catch (error) {
			// Return null if document not found or access denied
			// This allows recovery to handle missing documents gracefully
			console.warn(`Document recovery failed for ${documentId}:`, error);
			return null;
		}
	},
});

// Mutation to create a new document
export const createDocument = mutation({
	args: {
		title: v.string(),
		content: v.optional(v.string()),
		isPublic: v.optional(v.boolean()),
	},
	returns: v.id("documents"),
	handler: async (ctx, { title, content, isPublic }) => {
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

		const now = Date.now();
		return await ctx.db.insert("documents", {
			title: title.trim(),
			content:
				content ||
				JSON.stringify([{ type: "paragraph", children: [{ text: "" }] }]),
			ownerId: userId,
			isPublic: isPublic || false,
			collaborators: [],
			createdAt: now,
			updatedAt: now,
		});
	},
});

// Mutation to update a document
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
 * Query to search documents with filters and sorting
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
		},
	) => {
		const userId = await getCurrentUser(ctx);

		let documents = await ctx.db
			.query("documents")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();

		// Apply filters
		if (folderId !== undefined) {
			documents = documents.filter((doc) => doc.folderId === folderId);
		}

		if (status !== undefined) {
			documents = documents.filter((doc) => doc.status === status);
		}

		if (tags && tags.length > 0) {
			documents = documents.filter((doc) =>
				tags.some((tag) => doc.tags?.includes(tag)),
			);
		}

		if (query && query.trim().length > 0) {
			const searchTerm = query.toLowerCase();
			documents = documents.filter((doc) =>
				doc.title.toLowerCase().includes(searchTerm),
			);
		}

		// Apply sorting
		documents.sort((a, b) => {
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

		// Apply limit
		return documents.slice(0, limit);
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
			// Get documents in specific folder
			documents = await ctx.db
				.query("documents")
				.withIndex("by_folder", (q) => q.eq("folderId", folderId))
				.collect();

			// Filter by ownership and access
			documents = documents.filter((doc) => {
				return (
					doc.ownerId === userId ||
					doc.isPublic ||
					doc.collaborators?.includes(userId)
				);
			});
		} else {
			// Get documents not in any folder (root level)
			documents = await ctx.db
				.query("documents")
				.withIndex("by_owner", (q) => q.eq("ownerId", userId))
				.collect();

			documents = documents.filter((doc) => !doc.folderId);
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
	handler: async (ctx, { status, limit = 50 }) => {
		const userId = await getCurrentUser(ctx);

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_status", (q) => q.eq("status", status))
			.collect();

		// Filter by ownership and access
		const accessibleDocuments = documents.filter((doc) => {
			return (
				doc.ownerId === userId ||
				doc.isPublic ||
				doc.collaborators?.includes(userId)
			);
		});

		// Sort by updated date (newest first)
		accessibleDocuments.sort((a, b) => b.updatedAt - a.updatedAt);

		return accessibleDocuments.slice(0, limit);
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

		// Validate folder if provided
		if (folderId) {
			const folder = await ctx.db.get(folderId);
			if (!folder || folder.ownerId !== userId) {
				throw new ConvexError("Invalid folder or access denied");
			}
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
	returns: v.array(v.id("documents")),
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
			const folder = await ctx.db.get(updates.folderId);
			if (!folder || folder.ownerId !== userId) {
				throw new ConvexError("Invalid folder or access denied");
			}
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

		const updatedDocuments: Id<"documents">[] = [];
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
				updatedDocuments.push(documentId);
			} catch (error) {
				// Skip documents that can't be updated (access denied, not found, etc.)
				console.warn(`Failed to update document ${documentId}:`, error);
			}
		}

		return updatedDocuments;
	},
});

/**
 * Mutation to archive documents (set status to archived)
 */
export const archiveDocuments = mutation({
	args: {
		documentIds: v.array(v.id("documents")),
	},
	returns: v.array(v.id("documents")),
	handler: async (ctx, { documentIds }) => {
		const userId = await getCurrentUser(ctx);

		// Validate document count
		if (documentIds.length === 0) {
			throw new ConvexError("No documents specified for archiving");
		}
		if (documentIds.length > 100) {
			throw new ConvexError("Cannot archive more than 100 documents at once");
		}

		const archivedDocuments: Id<"documents">[] = [];
		const now = Date.now();

		// Process each document
		for (const documentId of documentIds) {
			try {
				await checkDocumentEditAccess(ctx, documentId, userId);

				await ctx.db.patch(documentId, {
					status: "archived",
					updatedAt: now,
				});

				archivedDocuments.push(documentId);
			} catch (error) {
				// Skip documents that can't be archived (access denied, not found, etc.)
				console.warn(`Failed to archive document ${documentId}:`, error);
			}
		}

		return archivedDocuments;
	},
});
