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
		expiresAt: v.optional(v.number()),
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
		// Re-check ownership/editor rights inline to avoid cross-file helper coupling.
		const doc = await ctx.db.get(documentId);
		if (!doc) throw new ConvexError("Document not found");
		const isOwner = doc.ownerId === callerId;
		let isEditor = false;
		if (!isOwner) {
			const compositeKey = `${String(documentId)}|${String(callerId)}`;
			const rows = await ctx.db
				.query("documentCollaborators")
				.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
				.collect();
			isEditor = rows.some((r) => r.role === "editor");
		}
		// Only owners may create editor-level share links.
		if (role === "editor" && !isOwner) {
			throw new ConvexError(
				"Access denied: Only owner may create editor-level links",
			);
		}
		// For non-editor links, allow owner or editor to create them.
		if (!isOwner && !isEditor) {
			throw new ConvexError("Access denied: Requires owner or editor role");
		}

		const token = crypto.randomBytes(24).toString("base64url");
		// Hash the token for safe storage at rest
		const tokenHash = crypto
			.createHash("sha256")
			.update(token)
			.digest("base64url");
		const now = Date.now();

		// Validate expiresAt: must be in the future and not exceed MAX_TTL_MS
		const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
		if (expiresAt != null) {
			if (expiresAt <= now) {
				throw new ConvexError("expiresAt must be in the future");
			}
			if (expiresAt - now > MAX_TTL_MS) {
				throw new ConvexError("expiresAt exceeds max allowed TTL");
			}
		}

		const tokenId = await ctx.db.insert("shareTokens", {
			documentId,
			tokenHash,
			role,
			createdBy: callerId,
			createdAt: now,
			// Schema expects expiresAt as optional number (undefined when absent).
			expiresAt: expiresAt === undefined ? undefined : expiresAt,
		});

		// Return plaintext token only to the caller (not stored in DB)
		return { tokenId, token, role };
	},
});
