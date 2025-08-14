import { ConvexError, v } from "convex/values";
import * as Y from "yjs";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { checkDocumentAccess, getCurrentUser } from "./authHelpers";

// Lightweight gated debug helper to avoid leaking user content in production
const YJS_DEBUG =
	typeof process !== "undefined" &&
	process.env &&
	process.env.NODE_ENV !== "production" &&
	typeof process !== "undefined" &&
	process.env &&
	(process.env.YJS_DEBUG === "1" || process.env.DEBUG?.includes("yjs"));
const dbg = (...args: unknown[]) => {
	if (YJS_DEBUG) {
		try {
			console.debug(...args);
		} catch {}
	}
};

// Threshold for how many batched updates should trigger creating a document version.
// Keep this as a named constant so it can be tuned and referenced in comments/tests.
export const DOCUMENT_VERSION_THRESHOLD = 10;

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

	// Diagnostics: track delta composition and sample embedded inserts
	let __dbg_stringInserts = 0;
	let __dbg_objectInserts = 0;
	const __dbg_embeddedSamples: Array<{
		kind: string;
		keys: string[];
		preview?: string | null;
	}> = [];

	const __summarizeEmbedded = (obj: unknown) => {
		const isObject = typeof obj === "object" && obj !== null;
		const ctorName = isObject
			? ((obj as { constructor?: { name?: string } })?.constructor?.name ??
				"object")
			: typeof obj;
		const keys = isObject
			? Object.keys(obj as Record<string, unknown>).slice(0, 8)
			: [];
		let preview: string | null = null;
		try {
			const s = String(obj);
			preview = s.length > 80 ? `${s.slice(0, 80)}…` : s;
		} catch {
			preview = null;
		}
		return { kind: ctorName, keys, preview };
	};

	for (const op of delta) {
		if (typeof op.insert === "string") {
			// Handle text insertion
			const text = op.insert;
			const attributes = op.attributes || {};
			__dbg_stringInserts++;

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
			// Handle embedded objects conservatively:
			// - Try to extract a meaningful text preview (toString or .text)
			// - If none is available, insert a visible placeholder character to
			//   avoid silently dropping content and to keep paragraph structure stable.
			__dbg_objectInserts++;
			// Only perform expensive / potentially PII-prone sample extraction when debug is enabled
			if (YJS_DEBUG) {
				try {
					if (__dbg_embeddedSamples.length < 3) {
						__dbg_embeddedSamples.push(__summarizeEmbedded(op.insert));
					}
				} catch {}
			}

			let embeddedText = "";
			try {
				const maybeObj = op.insert;
				// Prefer an explicit string 'text' property when present.
				if (
					typeof maybeObj === "object" &&
					maybeObj !== null &&
					"text" in maybeObj &&
					typeof (maybeObj as { text: unknown }).text === "string"
				) {
					embeddedText = String((maybeObj as { text: string }).text);
				} else if (
					typeof maybeObj === "object" &&
					maybeObj !== null &&
					"toString" in maybeObj &&
					typeof (maybeObj as { toString: unknown }).toString === "function"
				) {
					// Use toString() only if it returns a non-default, non-empty string.
					try {
						const s = (maybeObj as { toString: () => string }).toString();
						// Filter out default "[object ...]" outputs which are unhelpful.
						if (
							typeof s === "string" &&
							s.length > 0 &&
							!/^\[object .*]$/.test(s)
						) {
							embeddedText = s;
						} else {
							embeddedText = "\uFFFC";
						}
					} catch {
						embeddedText = "\uFFFC";
					}
				} else {
					// No meaningful text available — use a unicode object replacement
					// character to preserve document layout and make the embed visible.
					// This avoids silently losing content in downstream snapshots.
					embeddedText = "\uFFFC";
				}
			} catch {
				embeddedText = "\uFFFC";
			}

			// Log when we had to fall back to a placeholder for easier diagnostics.
			if (embeddedText === "\uFFFC") {
				try {
					dbg("[yjsSync] embedded object converted to placeholder", {
						sample: __dbg_embeddedSamples[__dbg_embeddedSamples.length - 1],
						opAttributes: op.attributes,
					});
				} catch {}
			}

			// Split text (or placeholder) by newlines to create separate paragraphs
			const lines = embeddedText.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				// Add text (or placeholder) to current paragraph if non-empty (align with string branch)
				if (line.length > 0) {
					const textNode: SlateTextNode = { text: line };
					const attributes = op.attributes || {};
					if (attributes.bold) textNode.bold = true;
					if (attributes.italic) textNode.italic = true;
					if (attributes.underline) textNode.underline = true;
					if (attributes.code) textNode.code = true;
					currentParagraph.children.push(textNode);
				}

				// If there's a newline (except for the last line), finish current paragraph
				if (i < lines.length - 1) {
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

	// Emit a concise debug summary for diagnostics
	try {
		dbg("[yjsSync:deltaToSlateNodes] delta summary", {
			totalOps: delta.length,
			stringInserts: __dbg_stringInserts,
			objectInserts: __dbg_objectInserts,
			embeddedSamples: __dbg_embeddedSamples,
		});
	} catch {}

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
			dbg("[yjsSync:createDocumentVersion] starting delta extraction", {
				documentId,
				yjsProtocolVersion,
			});
			const delta = sharedType.toDelta();
			try {
				const objectOps = delta.filter(
					(op: DeltaOperation) => typeof op.insert === "object",
				).length;
				const totalOps = delta.length;
				dbg("[yjsSync:createDocumentVersion] delta stats", {
					documentId,
					totalOps,
					objectOps,
					stringOps: totalOps - objectOps,
					sample:
						objectOps > 0
							? delta
									.filter((op: DeltaOperation) => typeof op.insert === "object")
									.slice(0, 2)
									.map((op: DeltaOperation) => {
										const ins: unknown = op.insert;
										const kind =
											typeof ins === "object" && ins !== null
												? ((ins as { constructor?: { name?: string } })
														?.constructor?.name ?? "object")
												: typeof ins;
										const keys =
											typeof ins === "object" && ins !== null
												? Object.keys(ins as Record<string, unknown>).slice(
														0,
														6,
													)
												: [];
										return { kind, keys };
									})
							: [],
				});
			} catch {}

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
		// Strategy:
		//  - Read the highest version using the by_document_version index ordered by version desc
		//  - Attempt insert for nextVersion
		//  - If multiple rows exist for the same (documentId, version), pick a deterministic winner
		//    (smallest createdAt, then smallest _id) and delete the other conflicting rows.
		//  - Retry a bounded number of times with a small jittered backoff to reduce contention.
		const MAX_RETRIES = 5;
		let attempt = 0;
		let winnerId: Id<"documentVersions"> | null = null;
		while (attempt < MAX_RETRIES && !winnerId) {
			attempt++;

			// Read the highest version deterministically using the by_document_version index
			const lastVersionRow = await ctx.db
				.query("documentVersions")
				.withIndex("by_document_version", (q) => q.eq("documentId", documentId))
				.order("desc")
				.first();

			const nextVersion = lastVersionRow ? lastVersionRow.version + 1 : 1;

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

			let insertedId: Id<"documentVersions"> | null = null;
			try {
				// Attempt insert.
				insertedId = await ctx.db.insert("documentVersions", record);

				// Query all rows that share the same (documentId, version) using the strict index.
				const sameVersionRows = await ctx.db
					.query("documentVersions")
					.withIndex("by_document_version", (q) =>
						q.eq("documentId", documentId).eq("version", nextVersion),
					)
					.collect();

				if (sameVersionRows.length === 1) {
					// No conflict, our inserted row is the unique winner.
					winnerId = insertedId;
					console.log(
						`Created document version ${nextVersion} for document ${documentId} (id=${winnerId})`,
					);
					return winnerId;
				}

				// Conflict detected: choose a deterministic winner among the rows.
				// Criteria: prefer smallest _creationTime (always present) or fallback to createdAt,
				// then smallest _id as a final tiebreaker so selection is deterministic.
				let chosen = sameVersionRows[0];
				for (const row of sameVersionRows) {
					const rowTime =
						typeof row._creationTime !== "undefined"
							? +row._creationTime
							: typeof row.createdAt !== "undefined"
								? +row.createdAt
								: Number.POSITIVE_INFINITY;
					const chosenTime =
						typeof chosen._creationTime !== "undefined"
							? +chosen._creationTime
							: typeof chosen.createdAt !== "undefined"
								? +chosen.createdAt
								: Number.POSITIVE_INFINITY;
					if (
						rowTime < chosenTime ||
						(rowTime === chosenTime && String(row._id) < String(chosen._id))
					) {
						chosen = row;
					}
				}

				const chosenId: Id<"documentVersions"> =
					chosen._id as Id<"documentVersions">;
				// Delete all other conflicting rows (do NOT delete the chosen winner).
				for (const row of sameVersionRows) {
					const idToMaybeDelete = row._id as Id<"documentVersions">;
					if (String(idToMaybeDelete) !== String(chosenId)) {
						try {
							await ctx.db.delete(idToMaybeDelete);
						} catch (delErr) {
							// Log and continue; best-effort cleanup to leave the deterministic winner.
							console.warn(
								`Failed to delete conflicting documentVersion ${idToMaybeDelete} for document ${documentId} version ${nextVersion}:`,
								delErr,
							);
						}
					}
				}

				// If our inserted row wasn't the chosen winner, set winnerId to chosen and return it.
				winnerId = chosenId;
				console.log(
					`Resolved document version ${nextVersion} for document ${documentId}, keeping id=${winnerId}`,
				);
				return winnerId;
			} catch (err) {
				dbg(
					`[yjsSync:createDocumentVersion] insert/resolve failed (attempt ${attempt})`,
					{ documentId, err: String(err) },
				);
				// On transient failures, fall through to retry after jittered backoff
			} finally {
				// If we inserted a row but did not win and it's still present, avoid leaving stray rows:
				// We'll attempt to clean it up on the next loop iteration or best-effort now.
				// Note: we don't delete blindly here to avoid races where another process already
				// cleaned up; delete failures are non-fatal.
				// Small best-effort cleanup:
				if (insertedId && !winnerId) {
					try {
						// It's possible the insertedId was deleted by the conflict resolution above;
						// ignore errors if delete fails.
						await ctx.db.delete(insertedId);
					} catch (_e) {}
				}
			}

			// Jittered backoff before retrying to reduce contention.
			// Use capped exponential backoff with jitter to reduce contention under load.
			const backoffMs = Math.min(
				1000,
				(50 << attempt) + Math.floor(Math.random() * 100),
			); // capped exp. backoff
			await new Promise((r) => setTimeout(r, backoffMs));
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
				const mergeStart = Date.now();
				try {
					dbg("[yjsSync] mergeUpdates start", {
						documentId,
						existingBytes: existingState.byteLength,
						incomingBytes: incomingUpdate.byteLength,
					});
				} catch {}
				mergedUpdate = Y.mergeUpdates([existingState, incomingUpdate]);
				const mergeDuration = Date.now() - mergeStart;
				try {
					dbg("[yjsSync] mergeUpdates completed", {
						documentId,
						mergedBytes: mergedUpdate.byteLength,
						durationMs: mergeDuration,
					});
				} catch {}

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
			const lastVersionTime = document.yjsUpdatedAt || document._creationTime;
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
				const mergeStart = Date.now();
				try {
					dbg("[yjsSync] applyYjsUpdate merge start", {
						documentId,
						existingBytes: existingState.byteLength,
						incomingBytes: incomingUpdate.byteLength,
					});
				} catch {}
				mergedUpdate = Y.mergeUpdates([existingState, incomingUpdate]);
				const mergeDuration = Date.now() - mergeStart;
				try {
					dbg("[yjsSync] applyYjsUpdate merge completed", {
						documentId,
						mergedBytes: mergedUpdate.byteLength,
						durationMs: mergeDuration,
					});
				} catch {}
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
				yjsStateVector: toArrayBuffer(newStateVector),
				yjsUpdatedAt: now,
				updatedAt: now,
			});

			// Create a document version periodically
			const lastVersionTime = document.yjsUpdatedAt || document._creationTime;
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
			const mergeStartAll = Date.now();
			const mergedIncomingUpdate =
				updates.length > 1 ? Y.mergeUpdates(uint8Updates) : uint8Updates[0];
			try {
				dbg("[yjsSync] batched merge incoming updates", {
					documentId,
					numIncoming: updates.length,
					mergedIncomingBytes: mergedIncomingUpdate.byteLength,
				});
			} catch {}

			let finalUpdate: Uint8Array;

			if (document.yjsState) {
				// Existing state exists - merge with the incoming updates
				const existingState = new Uint8Array(document.yjsState);
				finalUpdate = Y.mergeUpdates([existingState, mergedIncomingUpdate]);
				const mergeDurationAll = Date.now() - mergeStartAll;
				try {
					dbg("[yjsSync] batched final merge completed", {
						documentId,
						finalBytes: finalUpdate.byteLength,
						durationMs: mergeDurationAll,
					});
				} catch {}
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

			// Create a document version for significant updates (when the batch size
			// meets or exceeds DOCUMENT_VERSION_THRESHOLD). This helps with version
			// history without creating too many versions.
			if (updates.length >= DOCUMENT_VERSION_THRESHOLD) {
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
