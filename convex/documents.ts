import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query to get all documents for the current user
export const getUserDocuments = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.order("desc")
			.collect();

		return documents;
	},
});

// Query to get a specific document by ID
export const getDocument = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		// Check if user has access to this document
		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new Error("Access denied");
		}

		return document;
	},
});

// Mutation to create a new document
export const createDocument = mutation({
	args: {
		title: v.string(),
		content: v.optional(v.string()),
		isPublic: v.optional(v.boolean()),
	},
	handler: async (ctx, { title, content, isPublic }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const now = Date.now();
		const documentId = await ctx.db.insert("documents", {
			title,
			content:
				content ||
				JSON.stringify([{ type: "paragraph", children: [{ text: "" }] }]),
			ownerId: userId,
			isPublic: isPublic || false,
			collaborators: [],
			createdAt: now,
			updatedAt: now,
		});

		return documentId;
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
	handler: async (ctx, { documentId, title, content, isPublic }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		// Check if user can edit this document
		const canEdit =
			document.ownerId === userId || document.collaborators?.includes(userId);

		if (!canEdit) {
			throw new Error("Access denied");
		}

		const updates: Partial<{
			title: string;
			content: string;
			isPublic: boolean;
			updatedAt: number;
		}> = {
			updatedAt: Date.now(),
		};

		if (title !== undefined) updates.title = title;
		if (content !== undefined) updates.content = content;
		if (isPublic !== undefined) updates.isPublic = isPublic;

		await ctx.db.patch(documentId, updates);
		return documentId;
	},
});

// Mutation to delete a document
export const deleteDocument = mutation({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		// Only owner can delete
		if (document.ownerId !== userId) {
			throw new Error("Access denied");
		}

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
	handler: async (ctx, { documentId, collaboratorId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		// Only owner can add collaborators
		if (document.ownerId !== userId) {
			throw new Error("Access denied");
		}

		const currentCollaborators = document.collaborators || [];
		if (!currentCollaborators.includes(collaboratorId)) {
			await ctx.db.patch(documentId, {
				collaborators: [...currentCollaborators, collaboratorId],
				updatedAt: Date.now(),
			});
		}

		return documentId;
	},
});

// Mutation to remove a collaborator from a document
export const removeCollaborator = mutation({
	args: {
		documentId: v.id("documents"),
		collaboratorId: v.id("users"),
	},
	handler: async (ctx, { documentId, collaboratorId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		// Only owner can remove collaborators
		if (document.ownerId !== userId) {
			throw new Error("Access denied");
		}

		const currentCollaborators = document.collaborators || [];
		await ctx.db.patch(documentId, {
			collaborators: currentCollaborators.filter((id) => id !== collaboratorId),
			updatedAt: Date.now(),
		});

		return documentId;
	},
});
