import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Real-time subscription for user presence in a document
 * Optimized for live collaboration features
 */
export const subscribeToPresence = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new ConvexError("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new ConvexError("Access denied");
		}

		// Get active sessions (last 2 minutes)
		const activeThreshold = Date.now() - (2 * 60 * 1000);
		const sessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), activeThreshold))
			.collect();

		// Get user details for each active session
		const activeUsers = await Promise.all(
			sessions.map(async (session) => {
				const user = await ctx.db.get(session.userId);
				if (!user) return null;

				return {
					sessionId: session._id,
					userId: session.userId,
					user: {
						_id: user._id,
						name: user.name || 'Anonymous',
						email: user.email,
						image: user.image,
					},
					cursor: session.cursor,
					selection: session.selection,
					lastSeen: session.lastSeen,
					isCurrentUser: session.userId === userId,
				};
			})
		);

		return {
			documentId,
			activeUsers: activeUsers.filter(Boolean),
			totalActiveUsers: activeUsers.filter(Boolean).length,
			lastUpdated: Date.now(),
		};
	},
});

/**
 * Query to get active collaboration sessions for a document
 * Optimized for real-time collaboration features
 * Returns sessions from users active in the last 2 minutes
 */
export const getCollaborationSessions = query({
	args: {
		documentId: v.id("documents"),
		includeInactive: v.optional(v.boolean()), // Include sessions from last 5 minutes
	},
	handler: async (ctx, { documentId, includeInactive = false }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new ConvexError("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new ConvexError("Access denied");
		}

		// Determine time threshold based on includeInactive flag
		const timeThreshold = includeInactive
			? Date.now() - 300000  // 5 minutes for inactive sessions
			: Date.now() - 120000; // 2 minutes for active sessions only

		// Get collaboration sessions filtered by time threshold
		const sessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), timeThreshold))
			.collect();

		// Get user information for each session
		const sessionsWithUsers = await Promise.all(
			sessions.map(async (session) => {
				const user = await ctx.db.get(session.userId);
				const isActive = session.lastSeen > Date.now() - 120000; // Active in last 2 minutes

				return {
					...session,
					isActive,
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

		// Sort by last seen (most recent first) and filter out sessions without users
		return sessionsWithUsers
			.filter((session) => session.user !== null)
			.sort((a, b) => b.lastSeen - a.lastSeen);
	},
});

/**
 * Lightweight query for real-time cursor positions only
 * Optimized for frequent updates during collaborative editing
 */
export const getRealtimeCursors = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new ConvexError("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new ConvexError("Access denied");
		}

		// Get very recent sessions (last 30 seconds) for real-time cursors
		const thirtySecondsAgo = Date.now() - 30000;
		const sessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), thirtySecondsAgo))
			.collect();

		// Return minimal data for efficient real-time updates, exclude current user
		const cursors = await Promise.all(
			sessions
				.filter((session) => session.userId !== userId)
				.map(async (session) => {
					const user = await ctx.db.get(session.userId);
					return {
						userId: session.userId,
						userName: user?.name || user?.email || "Anonymous",
						cursor: session.cursor,
						selection: session.selection,
						lastSeen: session.lastSeen,
					};
				}),
		);

		return cursors;
	},
});

/**
 * Get user presence count for a document (lightweight)
 * Useful for showing "X users viewing" indicators
 */
export const getDocumentPresenceCount = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new ConvexError("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new ConvexError("Access denied");
		}

		// Count active users (last 2 minutes)
		const twoMinutesAgo = Date.now() - 120000;
		const activeSessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), twoMinutesAgo))
			.collect();

		// Count unique users
		const uniqueUsers = new Set(activeSessions.map((session) => session.userId));

		return {
			documentId,
			activeUserCount: uniqueUsers.size,
			timestamp: Date.now(),
		};
	},
});

// Mutation to remove user's collaboration session (when they leave)
export const removeCollaborationSession = mutation({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
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
			throw new ConvexError("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new ConvexError("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new ConvexError("Access denied");
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
			throw new ConvexError("Not authenticated");
		}

		// Verify user can edit the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new ConvexError("Document not found");
		}

		const canEdit =
			document.ownerId === userId || document.collaborators?.includes(userId);

		if (!canEdit) {
			throw new ConvexError("Access denied");
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

/**
 * Update user presence information for real-time collaboration
 * This should be called frequently to maintain active status
 */
export const updatePresence = mutation({
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
			})
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
			})
		),
	},
	handler: async (ctx, { documentId, cursor, selection }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		// Verify user has access to the document
		const document = await ctx.db.get(documentId);
		if (!document) {
			throw new ConvexError("Document not found");
		}

		const hasAccess =
			document.ownerId === userId ||
			document.isPublic ||
			document.collaborators?.includes(userId);

		if (!hasAccess) {
			throw new ConvexError("Access denied");
		}

		const now = Date.now();

		// Check if session already exists
		const existingSession = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_user_document", (q) =>
				q.eq("userId", userId).eq("documentId", documentId)
			)
			.first();

		if (existingSession) {
			// Update existing session
			await ctx.db.patch(existingSession._id, {
				cursor,
				selection,
				lastSeen: now,
			});
			return existingSession._id;
		} else {
			// Create new session
			const sessionId = await ctx.db.insert("collaborationSessions", {
				documentId,
				userId,
				cursor,
				selection,
				lastSeen: now,
			});
			return sessionId;
		}
	},
});
