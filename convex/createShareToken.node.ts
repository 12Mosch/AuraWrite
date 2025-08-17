"use node";
import crypto from "node:crypto";
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { getCurrentUser } from "./authHelpers";

/**
 * Node-only mutation for creating secure share tokens.
 * Kept in a separate file with "use node" so bundlers and Convex run this in Node.
 */
export const createShareToken = mutation({
	args: {
		documentId: v.id("documents"),
		role: v.union(
			v.literal("viewer"),
			v.literal("commenter"),
			v.literal("editor"),
		),
		expiresAt: v.optional(v.union(v.number(), v.null())),
	},
	returns: v.object({
		tokenId: v.id("shareTokens"),
		token: v.string(),
		role: v.union(
			v.literal("viewer"),
			v.literal("commenter"),
			v.literal("editor"),
		),
	}),
	handler: async (ctx, { documentId, role, expiresAt }) => {
		const callerId = await getCurrentUser(ctx);
		// Allow owner or editor to create share links
		// Re-check ownership/editor rights inline to avoid cross-file helper coupling.
		const doc = await ctx.db.get(documentId);
		if (!doc) throw new ConvexError("Document not found");
		const isOwner = doc.ownerId === callerId;
		let isEditor = false;
		if (!isOwner) {
			const rows = await ctx.db
				.query("documentCollaborators")
				.withIndex("by_user_document", (q) =>
					q.eq("userId", callerId).eq("documentId", documentId),
				)
				.collect();
			isEditor = rows.some((r) => r.role === "editor");
		}
		if (!isOwner && !isEditor) {
			throw new ConvexError("Access denied: Requires owner or editor role");
		}

		const token = crypto.randomBytes(24).toString("base64url");
		const now = Date.now();

		const tokenId = await ctx.db.insert("shareTokens", {
			documentId,
			token,
			role,
			createdBy: callerId,
			createdAt: now,
			expiresAt: expiresAt === undefined ? null : expiresAt,
		});

		return { tokenId, token, role };
	},
});
