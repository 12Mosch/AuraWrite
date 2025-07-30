import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query to get active collaboration sessions for a document
export const getCollaborationSessions = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new Error("Access denied");
		}

		// Get active sessions (within last 30 seconds)
		const thirtySecondsAgo = Date.now() - 30000;
		const sessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), thirtySecondsAgo))
			.collect();

		// Get user information for each session
		const sessionsWithUsers = await Promise.all(
			sessions.map(async (session) => {
				const user = await ctx.db.get(session.userId);
				return {
					...session,
					user: user
						? {
								_id: user._id,
								name: user.name || user.email || "Anonymous",
								email: user.email,
							}
						: null,
				};
			}),
		);

		return sessionsWithUsers.filter((session) => session.user !== null);
	},
});

// Mutation to update user's collaboration session (cursor, selection, presence)
export const updateCollaborationSession = mutation({
	args: {
		documentId: v.id("documents"),
		cursor: v.optional(
			v.object({
				anchor: v.object({
					path: v.array(v.number()),
					offset: v.number(),
				}),
				focus: v.object({
					path: v.array(v.number()),
					offset: v.number(),
				}),
			}),
		),
		selection: v.optional(
			v.object({
				anchor: v.object({
					path: v.array(v.number()),
					offset: v.number(),
				}),
				focus: v.object({
					path: v.array(v.number()),
					offset: v.number(),
				}),
			}),
		),
	},
	handler: async (ctx, { documentId, cursor, selection }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new Error("Access denied");
		}

		// Find existing session or create new one
		const existingSession = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", userId).eq("documentId", documentId),
			)
			.first();

		const sessionData = {
			documentId,
			userId,
			cursor,
			selection,
			lastSeen: Date.now(),
		};

		if (existingSession) {
			await ctx.db.patch(existingSession._id, sessionData);
			return existingSession._id;
		} else {
			return await ctx.db.insert("collaborationSessions", sessionData);
		}
	},
});

// Mutation to remove user's collaboration session (when they leave)
export const removeCollaborationSession = mutation({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const existingSession = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", userId).eq("documentId", documentId),
			)
			.first();

		if (existingSession) {
			await ctx.db.delete(existingSession._id);
		}

		return true;
	},
});

// Mutation to clean up old collaboration sessions (called periodically)
export const cleanupOldSessions = mutation({
	args: {},
	handler: async (ctx) => {
		// Remove sessions older than 5 minutes
		const fiveMinutesAgo = Date.now() - 300000;
		const oldSessions = await ctx.db
			.query("collaborationSessions")
			.filter((q) => q.lt(q.field("lastSeen"), fiveMinutesAgo))
			.collect();

		for (const session of oldSessions) {
			await ctx.db.delete(session._id);
		}

		return oldSessions.length;
	},
});

// Query to get document versions for history
export const getDocumentVersions = query({
	args: {
		documentId: v.id("documents"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { documentId, limit = 10 }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new Error("Access denied");
		}

		const versions = await ctx.db
			.query("documentVersions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.order("desc")
			.take(limit);

		// Get user information for each version
		const versionsWithUsers = await Promise.all(
			versions.map(async (version) => {
				const user = await ctx.db.get(version.createdBy);
				return {
					...version,
					createdByUser: user
						? {
								_id: user._id,
								name: user.name || user.email || "Anonymous",
								email: user.email,
							}
						: null,
				};
			}),
		);

		return versionsWithUsers;
	},
});

// Mutation to save a document version
export const saveDocumentVersion = mutation({
	args: {
		documentId: v.id("documents"),
		content: v.string(),
	},
	handler: async (ctx, { documentId, content }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		// Verify user can edit the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new Error("Document not found");
		}

		const canEdit =
			document.ownerId === userId || document.collaborators?.includes(userId);

		if (!canEdit) {
			throw new Error("Access denied");
		}

		// Get the next version number
		const lastVersion = await ctx.db
			.query("documentVersions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.order("desc")
			.first();

		const nextVersion = lastVersion ? lastVersion.version + 1 : 1;

		const versionId = await ctx.db.insert("documentVersions", {
			documentId,
			content,
			version: nextVersion,
			createdBy: userId,
			createdAt: Date.now(),
		});

		return versionId;
	},
});
