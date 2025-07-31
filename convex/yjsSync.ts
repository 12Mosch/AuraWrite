import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import * as Y from "yjs";
import { getCurrentUser, checkDocumentAccess } from "./authHelpers";

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
 * Applies Y.Doc updates to the server state with proper merging
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

		try {
			let mergedUpdate: Uint8Array;
			let newStateVector: Uint8Array | undefined = stateVector ? new Uint8Array(stateVector) : undefined;

			if (document.yjsState) {
				// Existing state exists - merge the updates properly
				const existingState = new Uint8Array(document.yjsState);
				const incomingUpdate = new Uint8Array(update);

				// Merge the existing state with the new update
				// This ensures incremental updates are combined correctly
				mergedUpdate = Y.mergeUpdates([existingState, incomingUpdate]);

				// If we have a state vector, we can use it for conflict detection
				// For now, we'll use the provided state vector or generate a new one
				if (!stateVector) {
					// Create a temporary Y.Doc to generate the state vector
					const tempDoc = new Y.Doc();
					Y.applyUpdate(tempDoc, mergedUpdate);
					newStateVector = Y.encodeStateVector(tempDoc);
					tempDoc.destroy();
				}
			} else {
				// No existing state - use the update directly
				mergedUpdate = new Uint8Array(update);
			}

			// Store the merged update
			await ctx.db.patch(documentId, {
				yjsState: mergedUpdate,
				yjsStateVector: newStateVector,
				yjsUpdatedAt: now,
				updatedAt: now,
			});

			return {
				success: true,
				conflictUpdate: undefined, // No conflicts for this implementation
			};
		} catch (error) {
			console.error("Failed to merge Y.Doc updates:", error);
			throw new ConvexError("Failed to apply document update");
		}
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
	handler: async (ctx, { documentId, update }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		const now = Date.now();

		try {
			let mergedUpdate: Uint8Array;

			if (document.yjsState) {
				// Existing state exists - merge the updates properly
				const existingState = new Uint8Array(document.yjsState);
				const incomingUpdate = new Uint8Array(update);

				// Merge the existing state with the new update
				mergedUpdate = Y.mergeUpdates([existingState, incomingUpdate]);
			} else {
				// No existing state - use the update directly
				mergedUpdate = new Uint8Array(update);
			}

			// Create a temporary Y.Doc to compute the new state vector
			const tempDoc = new Y.Doc();
			Y.applyUpdate(tempDoc, mergedUpdate);
			const newStateVector = Y.encodeStateVector(tempDoc);
			tempDoc.destroy();

			// Store the merged update and updated state vector
			await ctx.db.patch(documentId, {
				yjsState: mergedUpdate,
				yjsStateVector: newStateVector,
				yjsUpdatedAt: now,
				updatedAt: now,
			});

			return {
				success: true,
				serverUpdate: undefined, // No server update needed for this implementation
			};
		} catch (error) {
			console.error("Failed to apply Y.Doc update:", error);
			throw new ConvexError("Failed to apply document update");
		}
	},
});

/**
 * Mutation to apply batched Y.Doc updates
 * Optimized for handling multiple updates efficiently
 */
export const applyBatchedYjsUpdates = mutation({
	args: {
		documentId: v.id("documents"),
		updates: v.array(v.bytes()), // Array of Y.Doc updates
		stateVector: v.optional(v.bytes()), // Current state vector for conflict detection
		clientId: v.optional(v.number()), // Y.Doc client ID for conflict resolution
	},
	returns: v.object({
		success: v.boolean(),
		conflictUpdate: v.optional(v.bytes()), // Update to resolve conflicts
		appliedUpdates: v.number(), // Number of updates successfully applied
	}),
	handler: async (ctx, { documentId, updates, stateVector }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		const now = Date.now();

		try {
			if (updates.length === 0) {
				return {
					success: true,
					conflictUpdate: undefined,
					appliedUpdates: 0,
				};
			}

			// Convert ArrayBuffers to Uint8Arrays for Yjs
			const uint8Updates = updates.map(update => new Uint8Array(update));

			// Merge all incoming updates first
			const mergedIncomingUpdate = updates.length > 1 ?
				Y.mergeUpdates(uint8Updates) :
				uint8Updates[0];

			let finalUpdate: Uint8Array;

			if (document.yjsState) {
				// Existing state exists - merge with the incoming updates
				const existingState = new Uint8Array(document.yjsState);
				finalUpdate = Y.mergeUpdates([existingState, mergedIncomingUpdate]);
			} else {
				// No existing state - use the merged incoming updates
				finalUpdate = mergedIncomingUpdate;
			}

			// Generate new state vector if not provided
			let newStateVector: Uint8Array | undefined = stateVector ? new Uint8Array(stateVector) : undefined;
			if (!stateVector) {
				const tempDoc = new Y.Doc();
				Y.applyUpdate(tempDoc, finalUpdate);
				newStateVector = Y.encodeStateVector(tempDoc);
				tempDoc.destroy();
			}

			// Apply the final merged update to the document
			await ctx.db.patch(documentId, {
				yjsState: finalUpdate,
				yjsStateVector: newStateVector,
				yjsUpdatedAt: now,
				updatedAt: now,
			});

			return {
				success: true,
				conflictUpdate: undefined, // No conflicts for this implementation
				appliedUpdates: updates.length,
			};
		} catch (error) {
			console.error('Failed to apply batched updates:', error);
			throw new ConvexError("Failed to apply batched document updates");
		}
	},
});
