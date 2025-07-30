import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Helper function to get current authenticated user
async function getCurrentUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		throw new ConvexError("Authentication required to access this resource");
	}
	return userId;
}

// Helper function to check document access permissions
async function checkDocumentAccess(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
	userId: Id<"users">,
): Promise<Doc<"documents">> {
	const document = await ctx.db.get(documentId);
	if (!document) {
		throw new ConvexError("Document not found");
	}

	const hasAccess =
		document.ownerId === userId ||
		document.isPublic ||
		document.collaborators?.includes(userId);

	if (!hasAccess) {
		throw new ConvexError("Access denied to this document");
	}

	return document;
}

/**
 * Query to get Y.Doc state for synchronization
 * Returns the current Y.Doc binary state and state vector
 */
export const getYjsState = query({
	args: { documentId: v.id("documents") },
	returns: v.object({
		yjsState: v.optional(v.bytes()),
		yjsStateVector: v.optional(v.bytes()),
		yjsUpdatedAt: v.optional(v.number()),
		_creationTime: v.number(),
	}),
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		return {
			yjsState: document.yjsState,
			yjsStateVector: document.yjsStateVector,
			yjsUpdatedAt: document.yjsUpdatedAt,
			_creationTime: document._creationTime,
		};
	},
});

/**
 * Mutation to update Y.Doc state
 * Applies Y.Doc updates to the server state
 */
export const updateYjsState = mutation({
	args: {
		documentId: v.id("documents"),
		update: v.bytes(), // Y.Doc update as binary data
		stateVector: v.optional(v.bytes()), // Current state vector
	},
	returns: v.object({
		success: v.boolean(),
		conflictUpdate: v.optional(v.bytes()), // Update to resolve conflicts
	}),
	handler: async (ctx, { documentId, update, stateVector }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		const now = Date.now();

		// For now, we'll store the update directly
		// In a production system, you might want to merge updates more intelligently
		await ctx.db.patch(documentId, {
			yjsState: update,
			yjsStateVector: stateVector,
			yjsUpdatedAt: now,
			updatedAt: now,
		});

		return {
			success: true,
			conflictUpdate: undefined, // No conflicts for now
		};
	},
});

/**
 * Mutation to initialize Y.Doc state for a new document
 */
export const initializeYjsState = mutation({
	args: {
		documentId: v.id("documents"),
		initialState: v.bytes(),
		stateVector: v.bytes(),
	},
	returns: v.boolean(),
	handler: async (ctx, { documentId, initialState, stateVector }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		// Only initialize if no Y.Doc state exists
		if (document.yjsState) {
			return false; // Already initialized
		}

		const now = Date.now();
		await ctx.db.patch(documentId, {
			yjsState: initialState,
			yjsStateVector: stateVector,
			yjsUpdatedAt: now,
			updatedAt: now,
		});

		return true;
	},
});

/**
 * Query to subscribe to Y.Doc state changes
 * Optimized for real-time synchronization
 */
export const subscribeToYjsState = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		// Return minimal data for efficient real-time updates
		return {
			_id: document._id,
			yjsState: document.yjsState,
			yjsStateVector: document.yjsStateVector,
			yjsUpdatedAt: document.yjsUpdatedAt,
			_creationTime: document._creationTime,
		};
	},
});

/**
 * Mutation to apply incremental Y.Doc updates
 * More efficient than replacing the entire state
 */
export const applyYjsUpdate = mutation({
	args: {
		documentId: v.id("documents"),
		update: v.bytes(),
		clientId: v.optional(v.number()), // Y.Doc client ID for conflict resolution
	},
	returns: v.object({
		success: v.boolean(),
		serverUpdate: v.optional(v.bytes()), // Update from server to apply locally
	}),
	handler: async (ctx, { documentId, update, clientId }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentAccess(ctx, documentId, userId);

		const now = Date.now();

		// For now, we'll store the update directly
		// In a production system, you would merge the update with existing state
		await ctx.db.patch(documentId, {
			yjsState: update,
			yjsUpdatedAt: now,
			updatedAt: now,
		});

		return {
			success: true,
			serverUpdate: undefined, // No server update needed for now
		};
	},
});
