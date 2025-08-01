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
