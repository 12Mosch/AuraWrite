import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { getCurrentUser } from "./authHelpers";

/**
 * Roles supported for collaborators and link tokens.
 */
export const RoleValidator = v.union(
	v.literal("viewer"),
	v.literal("commenter"),
	v.literal("editor"),
);

function makeCompositeKey(
	documentId: Id<"documents">,
	userId: Id<"users">,
): string {
	return `${String(documentId)}|${String(userId)}`;
}

/**
 * Helper: ensure the caller is owner or an editor on the document.
 * Returns the document for convenience.
 */
async function requireOwnerOrEditor(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
	callerId: Id<"users">,
) {
	const doc = await ctx.db.get(documentId);
	if (!doc) throw new ConvexError("Document not found");
	const isOwner = doc.ownerId === callerId;

	// Check role in documentCollaborators
	let isEditor = false;
	if (!isOwner) {
		const compositeKey = makeCompositeKey(documentId, callerId);
		const rows = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
			.collect();
		isEditor = rows.some((r) => r.role === "editor");
	}

	if (!isOwner && !isEditor) {
		throw new ConvexError("Access denied: Requires owner or editor role");
	}
	return doc;
}

/**
 * Helper: ensure the caller is the owner
 */
async function requireOwner(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
	callerId: Id<"users">,
) {
	const doc = await ctx.db.get(documentId);
	if (!doc) throw new ConvexError("Document not found");
	if (doc.ownerId !== callerId)
		throw new ConvexError("Access denied: Owner only");
	return doc;
}

/**
 * Helper: Determine the highest role for a user on a document
 */
async function getUserRole(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
	userId: Id<"users">,
	ownerId: Id<"users">,
): Promise<"owner" | "editor" | "commenter" | "viewer" | undefined> {
	if (userId === ownerId) return "owner";

	const compositeKey = makeCompositeKey(documentId, userId);
	const rows = await ctx.db
		.query("documentCollaborators")
		.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
		.collect();
	if (rows.length === 0) return undefined;
	if (rows.some((r) => r.role === "editor")) return "editor";
	if (rows.some((r) => r.role === "commenter")) return "commenter";
	return "viewer";
}

/**
 * Query: getDocumentSharing(documentId)
 * Returns document meta + collaborators (with roles) + isPublic + active share tokens.
 * Note: We do NOT return raw plaintext tokens here. The DB stores only token hashes
 * and raw tokens are returned once at creation time (by the token-creation API).
 * For safety, token hashes are not useful to clients and are omitted unless the
 * caller is a manager (owner or editor).
 */
export const getDocumentSharing = query({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.object({
		documentId: v.id("documents"),
		title: v.string(),
		ownerId: v.optional(v.id("users")),
		isPublic: v.optional(v.boolean()),
		collaborators: v.array(
			v.object({
				userId: v.id("users"),
				role: RoleValidator,
				addedBy: v.id("users"),
				createdAt: v.number(),
				updatedAt: v.number(),
			}),
		),
		tokens: v.array(
			v.object({
				_id: v.id("shareTokens"),
				role: RoleValidator,
				createdBy: v.id("users"),
				createdAt: v.number(),
				expiresAt: v.optional(v.number()),
			}),
		),
		// callerRole is useful to drive UI permissions client-side
		callerRole: v.optional(RoleValidator),
	}),
	handler: async (ctx, { documentId }) => {
		// Use a non-throwing caller lookup so anonymous/public viewers can access
		// public documents. getCurrentUser throws for anonymous users, so wrap it.
		let callerId: Id<"users"> | undefined;
		try {
			callerId = await getCurrentUser(ctx);
		} catch (_err) {
			callerId = undefined;
		}

		const doc = await ctx.db.get(documentId);
		if (!doc) throw new ConvexError("Document not found");

		// Access: allow owner, collaborators (any role), or public viewers
		let hasAccess = callerId !== undefined && doc.ownerId === callerId;
		if (!hasAccess && doc.isPublic === true) {
			hasAccess = true;
		}

		// Only look up a callerRole when we have an authenticated callerId.
		let callerRole: "owner" | "editor" | "commenter" | "viewer" | undefined;
		if (callerId !== undefined) {
			callerRole = await getUserRole(ctx, documentId, callerId, doc.ownerId);
		}

		if (!hasAccess && callerRole) {
			hasAccess = true;
		}

		// Map 'owner' to undefined for outward-facing callerRole (RoleValidator doesn't include 'owner')
		const isManager = callerRole === "owner" || callerRole === "editor";
		const callerRoleForReturn: "viewer" | "commenter" | "editor" | undefined =
			callerRole === "owner"
				? undefined
				: (callerRole as "viewer" | "commenter" | "editor" | undefined);

		if (!hasAccess) {
			throw new ConvexError("Access denied");
		}

		const collaborators: Doc<"documentCollaborators">[] = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();

		const tokens: Doc<"shareTokens">[] = await ctx.db
			.query("shareTokens")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();

		return {
			documentId,
			title: doc.title,
			ownerId: isManager ? doc.ownerId : undefined,
			isPublic: doc.isPublic,
			collaborators: isManager
				? collaborators.map((c) => ({
						userId: c.userId,
						role: c.role,
						addedBy: c.addedBy,
						createdAt: c.createdAt,
						updatedAt: c.updatedAt,
					}))
				: [],
			// Do not return raw or hashed tokens by default. Only owners and editors
			// (managers) receive token metadata to reduce information leakage.
			// Map callerRole === "owner" to manager as well.
			tokens: isManager
				? tokens
						// Exclude expired tokens. expiresAt may be null/undefined or a number.
						.filter(
							(t) =>
								!(typeof t.expiresAt === "number" && t.expiresAt < Date.now()),
						)
						// Exclude tokens marked revoked (backwards-compatible check in case
						// token documents include a revoked flag). Use a typed cast instead of
						// `any` to satisfy the linter.
						.filter((t) => {
							// Treat revokedAt (nullable) as the source of truth for soft-revocation.
							// Keep tokens where revokedAt is null/undefined; exclude when revokedAt is set.
							const tt = t as Doc<"shareTokens"> & { revokedAt?: string | null };
							return tt.revokedAt == null;
						})
						// Sort newest first by createdAt.
						.sort((a, b) => b.createdAt - a.createdAt)
						.map((t) => ({
							_id: t._id,
							role: t.role,
							createdBy: t.createdBy,
							createdAt: t.createdAt,
							expiresAt: t.expiresAt,
						}))
				: [],
			callerRole: callerRoleForReturn,
		};
	},
});

/**
 * mutation: addCollaborator(documentId, userId, role)
 * Only owner or editors can add, but role assignment is restricted:
 * - Owner can assign any role.
 * - Editor can only assign viewer or commenter (not editor).
 */
export const addCollaborator = mutation({
	args: {
		documentId: v.id("documents"),
		userId: v.id("users"),
		role: RoleValidator,
	},
	returns: v.id("documentCollaborators"),
	handler: async (ctx, { documentId, userId, role }) => {
		const callerId = await getCurrentUser(ctx);
		const doc = await requireOwnerOrEditor(ctx, documentId, callerId);

		// Validate that the target user actually exists to avoid dangling references.
		// This must run immediately after authorization and before any inserts/patches.
		const targetUser = await ctx.db.get(userId);
		if (!targetUser) {
			throw new ConvexError("Target user does not exist");
		}

		if (userId === doc.ownerId) {
			throw new ConvexError("Owner already has full access");
		}
		// Determine caller role (owner or editor)
		const isOwner = doc.ownerId === callerId;
		if (!isOwner && role === "editor") {
			throw new ConvexError("Editors cannot grant editor role");
		}

		// Compute deterministic composite key and check for existing entry
		const compositeKey = makeCompositeKey(documentId, userId);
		const existing = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
			.collect();
		if (existing.length > 0) {
			// Normalize deterministically to a single row for this (documentId, userId)
			// Keep the earliest by createdAt; tie-break on _id for stability.
			const sorted = existing
				.slice()
				.sort((a, b) =>
					a.createdAt !== b.createdAt
						? a.createdAt - b.createdAt
						: String(a._id).localeCompare(String(b._id)),
				);
			const [keep, ...dupes] = sorted;
			const nowTs = Date.now();
			// Refresh the surviving row's updatedAt and desired role if necessary.
			await ctx.db.patch(keep._id, {
				// Preserve existing role unless escalating via updateCollaboratorRole API.
				// Here we only refresh updatedAt to make "add" idempotent.
				updatedAt: nowTs,
			});
			// Remove any duplicates to converge state even if prior races occurred.
			if (dupes.length > 0) {
				await Promise.all(dupes.map((d) => ctx.db.delete(d._id)));
			}
			return keep._id;
		}

		const now = Date.now();
		const id = await ctx.db.insert("documentCollaborators", {
			documentId,
			userId,
			compositeKey,
			role,
			addedBy: callerId,
			createdAt: now,
			updatedAt: now,
		});

		// Best-effort dedupe under concurrency:
		// Recheck and deterministically remove extras, keeping the earliest by createdAt,
		// with a stable tie-break on _id to ensure convergence when timestamps collide.
		const after = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
			.collect();
		if (after.length > 1) {
			const sorted = after
				.slice()
				.sort((a, b) =>
					a.createdAt !== b.createdAt
						? a.createdAt - b.createdAt
						: String(a._id).localeCompare(String(b._id)),
				);
			const [keep, ...dupes] = sorted;
			await Promise.all(dupes.map((d) => ctx.db.delete(d._id)));
			return keep._id;
		}

		// Backward-compat: ensure legacy collaborators array contains the id (optional)
		// TODO: Remove this once all documents have been migrated to the new schema
		const coll = doc.collaborators || [];
		if (!coll.includes(userId)) {
			await ctx.db.patch(documentId, {
				collaborators: [...coll, userId],
				updatedAt: now,
			});
		}

		return id;
	},
});

/**
 * mutation: removeCollaborator(documentId, userId)
 * Only owner or editors. Editors cannot remove owner, naturally; also editors cannot remove other editors.
 */
export const removeCollaborator = mutation({
	args: {
		documentId: v.id("documents"),
		userId: v.id("users"),
	},
	returns: v.null(),
	handler: async (ctx, { documentId, userId }) => {
		const callerId = await getCurrentUser(ctx);
		const doc = await requireOwnerOrEditor(ctx, documentId, callerId);

		if (userId === doc.ownerId) {
			throw new ConvexError("Cannot remove owner");
		}

		const callerRole =
			(await getUserRole(ctx, documentId, callerId, doc.ownerId)) ?? "viewer";

		const compositeKey = makeCompositeKey(documentId, userId);
		const targetRows: Doc<"documentCollaborators">[] = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
			.collect();
		if (targetRows.length === 0) {
			throw new ConvexError("Collaborator not found");
		}

		const targetIsEditor = targetRows.some((r) => r.role === "editor");

		if (callerRole !== "owner" && targetIsEditor) {
			throw new ConvexError("Editors cannot remove other editors");
		}

		for (const r of targetRows) {
			await ctx.db.delete(r._id);
		}

		// Clean up any active collaboration sessions for this user on this document
		const sessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", userId).eq("documentId", documentId),
			)
			.collect();
		if (sessions.length > 0) {
			await Promise.all(sessions.map((s) => ctx.db.delete(s._id)));
		}

		// Update legacy collaborators array
		const coll = (doc.collaborators || []).filter(
			(id: Id<"users">) => id !== userId,
		);
		await ctx.db.patch(documentId, {
			collaborators: coll,
			updatedAt: Date.now(),
		});

		return null;
	},
});

/**
 * mutation: updateCollaboratorRole(documentId, userId, role)
 * Only owner can change collaborator roles.
 */
export const updateCollaboratorRole = mutation({
	args: {
		documentId: v.id("documents"),
		userId: v.id("users"),
		role: RoleValidator,
	},
	returns: v.null(),
	handler: async (ctx, { documentId, userId, role }) => {
		const callerId = await getCurrentUser(ctx);
		// requireOwner returns the doc; reuse it to avoid a second fetch.
		const doc = await requireOwner(ctx, documentId, callerId);

		// Cannot set role for owner
		if (userId === doc.ownerId) {
			throw new ConvexError("Owner role cannot be changed");
		}

		const compositeKey = makeCompositeKey(documentId, userId);
		const rows: Doc<"documentCollaborators">[] = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
			.collect();

		if (rows.length === 0) {
			throw new ConvexError("Collaborator not found");
		}

		// There should only be one row per user-document pair.
		// If multiple rows exist, normalize deterministically:
		// - Patch all matched rows to set the requested role and updatedAt.
		// - Then keep the earliest (by createdAt) and delete any later duplicates.
		if (rows.length > 1) {
			console.warn(
				`Multiple collaborator entries found for user ${userId} on document ${documentId}; normalizing entries`,
			);
		}

		const now = Date.now();
		// Update every matching row with the new role/updatedAt
		await Promise.all(
			rows.map((r) => ctx.db.patch(r._id, { role, updatedAt: now })),
		);

		// If duplicates exist, remove the later ones and keep the earliest entry.
		if (rows.length > 1) {
			const sorted = rows.slice().sort((a, b) => a.createdAt - b.createdAt);
			const [, ...dupes] = sorted;
			await Promise.all(dupes.map((d) => ctx.db.delete(d._id)));
		}

		return null;
	},
});

/**
 * mutation: setPublic(documentId, isPublic)
 * Only owner
 */
export const setPublic = mutation({
	args: {
		documentId: v.id("documents"),
		isPublic: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, { documentId, isPublic }) => {
		const callerId = await getCurrentUser(ctx);
		await requireOwner(ctx, documentId, callerId);
		await ctx.db.patch(documentId, { isPublic, updatedAt: Date.now() });
		return null;
	},
});

/**
 * mutation: revokeShareToken(documentId, tokenId)
 * Only owner
 */
export const revokeShareToken = mutation({
	args: {
		documentId: v.id("documents"),
		tokenId: v.id("shareTokens"),
	},
	returns: v.null(),
	handler: async (ctx, { documentId, tokenId }) => {
		const callerId = await getCurrentUser(ctx);
		await requireOwner(ctx, documentId, callerId);

		const token = await ctx.db.get(tokenId);
		if (!token) throw new ConvexError("Token not found");
		if (token.documentId !== documentId) {
			throw new ConvexError("Token does not belong to document");
		}
		// Soft-revoke for auditability: mark revokedAt and revokedBy rather than hard-delete.
		await ctx.db.patch(tokenId, { revokedAt: Date.now(), revokedBy: callerId });
		return null;
	},
});
