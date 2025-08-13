import { ConvexError, v } from "convex/values";
import * as Y from "yjs";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { checkDocumentAccess, getCurrentUser } from "./authHelpers";

// Type definitions for Y.js Delta operations
interface DeltaOperation {
	insert: string | object;
	attributes?: {
		bold?: boolean;
		italic?: boolean;
		underline?: boolean;
		code?: boolean;
		[key: string]: unknown;
	};
}

// Type definitions for Slate.js nodes
interface SlateTextNode {
	text: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	code?: boolean;
	[key: string]: unknown;
}

interface SlateParagraphNode {
	type: "paragraph";
	children: SlateTextNode[];
}

type SlateNode = SlateParagraphNode;

// Type for document patch data
interface DocumentPatchData {
	yjsState: ArrayBuffer;
	yjsStateVector?: ArrayBuffer;
	yjsUpdatedAt: number;
	updatedAt: number;
}

/**
 * Helper function to convert Uint8Array to ArrayBuffer
 * This is needed for Convex compatibility as it expects ArrayBuffer
 */
function toArrayBuffer(uint8Array: Uint8Array): ArrayBuffer {
	// Create a new ArrayBuffer and copy the data to ensure we get ArrayBuffer, not SharedArrayBuffer
	const arrayBuffer = new ArrayBuffer(uint8Array.byteLength);
	const view = new Uint8Array(arrayBuffer);
	view.set(uint8Array);
	return arrayBuffer;
}

/**
 * Convert Y.js Delta format to Slate.js nodes
 * Delta format: [{ insert: "text", attributes: { bold: true } }, ...]
 * Slate format: [{ type: "paragraph", children: [{ text: "text", bold: true }] }]
 */
export function deltaToSlateNodes(delta: DeltaOperation[]): SlateNode[] {
	if (!delta || delta.length === 0) {
		return [
			{
				type: "paragraph",
				children: [{ text: "" }],
			},
		];
	}

	const nodes: SlateNode[] = [];
	let currentParagraph: SlateParagraphNode = {
		type: "paragraph",
		children: [],
	};

	for (const op of delta) {
		if (typeof op.insert === "string") {
			// Handle text insertion
			const text = op.insert;
			const attributes = op.attributes || {};

			// Split text by newlines to create separate paragraphs
			const lines = text.split("\n");

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				if (line.length > 0) {
					// Add text to current paragraph
					const textNode: SlateTextNode = { text: line };

					// Apply formatting attributes
					if (attributes.bold) textNode.bold = true;
					if (attributes.italic) textNode.italic = true;
					if (attributes.underline) textNode.underline = true;
					if (attributes.code) textNode.code = true;

					currentParagraph.children.push(textNode);
				}

				// If there's a newline (except for the last line), finish current paragraph
				if (i < lines.length - 1) {
					// Ensure paragraph has at least empty text if no children
					if (currentParagraph.children.length === 0) {
						currentParagraph.children.push({ text: "" });
					}

					nodes.push(currentParagraph);
					currentParagraph = {
						type: "paragraph",
						children: [],
					};
				}
			}
		} else if (typeof op.insert === "object") {
			// Handle embedded objects (like images, links, etc.)
			// For now, we'll skip these or convert them to text
			console.warn(
				"Embedded objects in Y.js delta not fully supported:",
				op.insert,
			);
		}
	}

	// Add the final paragraph if it has content
	if (currentParagraph.children.length > 0) {
		nodes.push(currentParagraph);
	} else if (nodes.length === 0) {
		// Ensure we always have at least one paragraph
		nodes.push({
			type: "paragraph",
			children: [{ text: "" }],
		});
	}

	return nodes;
}

/**
 * Helper function to create a document version from Y.js state
 */
async function createDocumentVersion(
	ctx: MutationCtx,
	documentId: Id<"documents">,
	yjsState: ArrayBuffer,
	userId: Id<"users">,
	yjsProtocolVersion = 1, // default protocol version; bump on breaking changes
) {
	// Create Y.Doc before try block to ensure it's available for cleanup
	const tempDoc = new Y.Doc();

	try {
		// Convert Y.js state to a temporary Y.Doc to extract content
		Y.applyUpdate(tempDoc, new Uint8Array(yjsState));
		const sharedType = tempDoc.get("content", Y.XmlText);

		// Extract the full Slate.js structure from Y.XmlText
		// This preserves all formatting, links, and rich content
		let slateContent: string;

		try {
			// Use Y.XmlText's toDelta() method to get the rich content with formatting
			const delta = sharedType.toDelta();

			// Convert delta to Slate.js nodes
			// Delta format: [{ insert: "text", attributes: { bold: true } }, ...]
			const slateNodes = deltaToSlateNodes(delta);

			// Ensure we have at least one paragraph
			if (slateNodes.length === 0) {
				slateNodes.push({
					type: "paragraph",
					children: [{ text: "" }],
				});
			}

			slateContent = JSON.stringify(slateNodes);
		} catch (deltaError) {
			console.warn(
				"Failed to extract rich content from Y.XmlText, falling back to plain text:",
				deltaError,
			);

			// Fallback to plain text if delta conversion fails
			const textContent = sharedType.toString();
			slateContent = JSON.stringify([
				{
					type: "paragraph",
					children: [{ text: textContent || "" }],
				},
			]);
		}

		// Determine next version and safely insert to avoid race conditions.
		// Loop with limited retries: read latest, attempt insert; if a concurrent writer created the same version,
		// retry by recomputing the next version. This enforces uniqueness for (documentId, version) at write time.
		const MAX_RETRIES = 5;
		let attempt = 0;
		let insertedId: Id<"documentVersions"> | null = null;
		while (attempt < MAX_RETRIES && !insertedId) {
			attempt++;

			// Read the most recent version for this document
			const lastVersion = await ctx.db
				.query("documentVersions")
				.withIndex("by_document", (q) => q.eq("documentId", documentId))
				.order("desc")
				.first();

			const nextVersion = lastVersion ? lastVersion.version + 1 : 1;

			// Prepare the record including the canonical Yjs snapshot and protocol version
			const record = {
				documentId,
				content: slateContent,
				version: nextVersion,
				createdBy: userId,
				createdAt: Date.now(),
				yjsSnapshot: yjsState,
				yjsProtocolVersion,
			};

			try {
				// Attempt insert.
				insertedId = await ctx.db.insert("documentVersions", record);

				// Double-check uniqueness by querying whether there exist multiple entries
				// with the same (documentId, version). If duplicates exist, delete the extra
				// inserted record and retry.
				const sameVersion = await ctx.db
					.query("documentVersions")
					.withIndex("by_document_version", (q) =>
						q.eq("documentId", documentId).eq("version", nextVersion),
					)
					.collect();

				if (sameVersion.length > 1) {
					// Conflict detected: remove the record we just inserted and retry.
					console.warn(
						`Version conflict detected for document ${documentId} version ${nextVersion}, retrying (attempt ${attempt})`,
					);
					await ctx.db.delete(insertedId);
					insertedId = null;
					// Loop will retry after incrementing attempt
				} else {
					// Success
					console.log(
						`Created document version ${nextVersion} for document ${documentId}`,
					);
					return insertedId;
				}
			} catch (err) {
				console.warn(
					`Failed to insert document version for document ${documentId} (attempt ${attempt}):`,
					err,
				);
				// If insert failed for some reason, ensure insertedId is null and retry
				insertedId = null;
			}
		}

		console.error(
			`Failed to create unique document version for ${documentId} after ${MAX_RETRIES} attempts`,
		);
		return null;
	} catch (error) {
		console.error("Failed to create document version:", error);
		// Don't throw - versioning failure shouldn't break sync
		return null;
	} finally {
		// Always destroy the temporary Y.Doc to prevent memory leaks
		tempDoc.destroy();
	}
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
 * Real-time subscription query for Y.js state changes
 * This query will automatically re-run when the document's Y.js state changes,
 * enabling real-time collaboration between clients
 */
export const subscribeToYjsState = query({
	args: { documentId: v.id("documents") },
	returns: v.object({
		yjsState: v.optional(v.bytes()),
		yjsStateVector: v.optional(v.bytes()),
		yjsUpdatedAt: v.optional(v.number()),
		_creationTime: v.number(),
		documentId: v.id("documents"),
	}),
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		return {
			yjsState: document.yjsState,
			yjsStateVector: document.yjsStateVector,
			yjsUpdatedAt: document.yjsUpdatedAt,
			_creationTime: document._creationTime,
			documentId: document._id,
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
			let newStateVector: Uint8Array | undefined = stateVector
				? new Uint8Array(stateVector)
				: undefined;

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
					try {
						Y.applyUpdate(tempDoc, mergedUpdate);
						newStateVector = Y.encodeStateVector(tempDoc);
					} finally {
						tempDoc.destroy();
					}
				}
			} else {
				// No existing state - use the update directly
				mergedUpdate = new Uint8Array(update);
			}

			// Store the merged update (convert Uint8Array to ArrayBuffer for Convex)
			await ctx.db.patch(documentId, {
				yjsState: toArrayBuffer(mergedUpdate),
				yjsStateVector: newStateVector
					? toArrayBuffer(newStateVector)
					: undefined,
				yjsUpdatedAt: now,
				updatedAt: now,
			});

			// Create a document version periodically (every few updates)
			// We'll create a version roughly every 30 seconds of activity
			const lastVersionTime = document.yjsUpdatedAt || document.createdAt;
			if (!lastVersionTime || now - lastVersionTime > 30000) {
				await createDocumentVersion(
					ctx,
					documentId,
					toArrayBuffer(mergedUpdate),
					userId,
				);
			}

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
			yjsState: initialState, // Already converted to ArrayBuffer on client side
			yjsStateVector: stateVector, // Already converted to ArrayBuffer on client side
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
			let newStateVector: Uint8Array;
			try {
				Y.applyUpdate(tempDoc, mergedUpdate);
				newStateVector = Y.encodeStateVector(tempDoc);
			} finally {
				tempDoc.destroy();
			}

			// Store the merged update and updated state vector (convert Uint8Array to ArrayBuffer)
			await ctx.db.patch(documentId, {
				yjsState: toArrayBuffer(mergedUpdate),
				yjsStateVector: newStateVector
					? toArrayBuffer(newStateVector)
					: undefined,
				yjsUpdatedAt: now,
				updatedAt: now,
			});

			// Create a document version periodically
			const lastVersionTime = document.yjsUpdatedAt || document.createdAt;
			if (!lastVersionTime || now - lastVersionTime > 30000) {
				await createDocumentVersion(
					ctx,
					documentId,
					toArrayBuffer(mergedUpdate),
					userId,
				);
			}

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
			const uint8Updates = updates.map((update) => new Uint8Array(update));

			// Merge all incoming updates first
			const mergedIncomingUpdate =
				updates.length > 1 ? Y.mergeUpdates(uint8Updates) : uint8Updates[0];

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
			let newStateVector: Uint8Array | undefined = stateVector
				? new Uint8Array(stateVector)
				: undefined;
			if (!stateVector) {
				const tempDoc = new Y.Doc();
				try {
					Y.applyUpdate(tempDoc, finalUpdate);
					newStateVector = Y.encodeStateVector(tempDoc);
				} finally {
					tempDoc.destroy();
				}
			}

			// Apply the final merged update to the document (convert Uint8Array to ArrayBuffer)
			const patchData: DocumentPatchData = {
				yjsState: toArrayBuffer(finalUpdate),
				yjsUpdatedAt: now,
				updatedAt: now,
			};

			if (newStateVector) {
				patchData.yjsStateVector = toArrayBuffer(newStateVector);
			}

			await ctx.db.patch(documentId, patchData);

			// Create a document version for significant updates (every 10 updates or more)
			// This helps with version history without creating too many versions
			if (updates.length >= 5) {
				await createDocumentVersion(
					ctx,
					documentId,
					toArrayBuffer(finalUpdate),
					userId,
				);
			}

			return {
				success: true,
				conflictUpdate: undefined, // No conflicts for this implementation
				appliedUpdates: updates.length,
			};
		} catch (error) {
			console.error("Failed to apply batched updates:", error);
			throw new ConvexError("Failed to apply batched document updates");
		}
	},
});
