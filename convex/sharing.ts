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
		const rows: Doc<"documentCollaborators">[] = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", callerId).eq("documentId", documentId),
			)
			.collect();
		isEditor = rows.some(
			(r: Doc<"documentCollaborators">) => r.role === "editor",
		);
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
 * Query: getDocumentSharing(documentId)
 * Returns document meta + collaborators (with roles) + isPublic + active share tokens.
 * Note: For MVP we return raw tokens. In production, prefer hashing tokens and never returning raw values except on creation.
 */
export const getDocumentSharing = query({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.object({
		documentId: v.id("documents"),
		title: v.string(),
		ownerId: v.id("users"),
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
				token: v.string(),
				createdBy: v.id("users"),
				createdAt: v.number(),
				expiresAt: v.optional(v.union(v.number(), v.null())),
			}),
		),
		// callerRole is useful to drive UI permissions client-side
		callerRole: v.optional(RoleValidator),
	}),
	handler: async (ctx, { documentId }) => {
		const callerId = await getCurrentUser(ctx);

		const doc = await ctx.db.get(documentId);
		if (!doc) throw new ConvexError("Document not found");

		// Access: allow owner, collaborators (any role), or public viewers
		let hasAccess = doc.ownerId === callerId || doc.isPublic === true;
		let callerRole: "viewer" | "commenter" | "editor" | undefined;

		if (!hasAccess) {
			const rows: Doc<"documentCollaborators">[] = await ctx.db
				.query("documentCollaborators")
				.withIndex("by_user_document", (q) =>
					q.eq("userId", callerId).eq("documentId", documentId),
				)
				.collect();
			if (rows.length > 0) {
				hasAccess = true;
				// Prefer the highest role if multiple rows exist (shouldn't normally happen)
				if (rows.some((r: Doc<"documentCollaborators">) => r.role === "editor"))
					callerRole = "editor";
				else if (
					rows.some((r: Doc<"documentCollaborators">) => r.role === "commenter")
				)
					callerRole = "commenter";
				else callerRole = "viewer";
			}
		}

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
			ownerId: doc.ownerId,
			isPublic: doc.isPublic,
			collaborators: collaborators.map((c) => ({
				userId: c.userId,
				role: c.role,
				addedBy: c.addedBy,
				createdAt: c.createdAt,
				updatedAt: c.updatedAt,
			})),
			tokens: tokens.map((t) => ({
				_id: t._id,
				role: t.role,
				token: t.token, // SECURITY NOTE: consider not returning raw tokens except at creation time.
				createdBy: t.createdBy,
				createdAt: t.createdAt,
				expiresAt: t.expiresAt,
			})),
			callerRole,
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

		if (userId === doc.ownerId) {
			throw new ConvexError("Owner already has full access");
		}
		// Determine caller role (owner or editor)
		const isOwner = doc.ownerId === callerId;
		if (!isOwner && role === "editor") {
			throw new ConvexError("Editors cannot grant editor role");
		}

		// Check if already present
		const existing = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", userId).eq("documentId", documentId),
			)
			.collect();
		if (existing.length > 0) {
			throw new ConvexError("User already a collaborator");
		}

		const now = Date.now();
		const id = await ctx.db.insert("documentCollaborators", {
			documentId,
			userId,
			role,
			addedBy: callerId,
			createdAt: now,
			updatedAt: now,
		});

		// Backward-compat: ensure legacy collaborators array contains the id (optional)
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

		// Determine caller role if not owner
		let callerRole: "viewer" | "commenter" | "editor" | "owner" = "viewer";
		if (doc.ownerId === callerId) callerRole = "owner";
		else {
			const rows = await ctx.db
				.query("documentCollaborators")
				.withIndex("by_user_document", (q) =>
					q.eq("userId", callerId).eq("documentId", documentId),
				)
				.collect();
			if (rows.some((r) => r.role === "editor")) callerRole = "editor";
			else if (rows.some((r) => r.role === "commenter"))
				callerRole = "commenter";
			else callerRole = "viewer";
		}

		const targetRows: Doc<"documentCollaborators">[] = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", userId).eq("documentId", documentId),
			)
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
		await requireOwner(ctx, documentId, callerId);

		// Cannot set role for owner
		const doc = await ctx.db.get(documentId);
		if (!doc) throw new ConvexError("Document not found");
		if (userId === doc.ownerId) {
			throw new ConvexError("Owner role cannot be changed");
		}

		const rows: Doc<"documentCollaborators">[] = await ctx.db
			.query("documentCollaborators")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", userId).eq("documentId", documentId),
			)
			.collect();

		if (rows.length === 0) {
			throw new ConvexError("Collaborator not found");
		}

		for (const r of rows) {
			await ctx.db.patch(r._id, { role, updatedAt: Date.now() });
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
		await ctx.db.delete(tokenId);
		return null;
	},
});
