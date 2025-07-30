import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

/**
 * Helper function to get current authenticated user
 * Throws error if user is not authenticated
 */
async function getCurrentUser(ctx: QueryCtx): Promise<Id<"users">> {
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		throw new Error("Authentication required");
	}
	return userId;
}

/**
 * Helper function to check if user has access to a document
 * Returns the document if access is granted, throws error otherwise
 */
async function checkDocumentAccess(
	ctx: QueryCtx,
	documentId: Id<"documents">,
	userId: Id<"users">,
): Promise<Doc<"documents">> {
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

	return document;
}

// ============================================================================
// DOCUMENT CHANGES SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to real-time document content changes
 * Optimized for efficient real-time updates of document content
 */
export const subscribeToDocument = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		// Return minimal data for efficient real-time updates
		return {
			_id: document._id,
			title: document.title,
			content: document.content,
			updatedAt: document.updatedAt,
			_creationTime: document._creationTime,
		};
	},
});

/**
 * Subscribe to real-time document metadata changes
 * Includes title, collaborators, permissions, and other metadata
 */
export const subscribeToDocumentMetadata = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		// Get collaborator details
		const collaboratorDetails = await Promise.all(
			(document.collaborators || []).map(async (collaboratorId) => {
				const user = await ctx.db.get(collaboratorId);
				return user ? {
					_id: user._id,
					name: user.name,
					email: user.email,
					image: user.image,
				} : null;
			})
		);

		// Get owner details
		const owner = await ctx.db.get(document.ownerId);

		return {
			_id: document._id,
			title: document.title,
			isPublic: document.isPublic || false,
			collaborators: collaboratorDetails.filter(Boolean),
			owner: owner ? {
				_id: owner._id,
				name: owner.name,
				email: owner.email,
				image: owner.image,
			} : null,
			createdAt: document.createdAt,
			updatedAt: document.updatedAt,
			yjsUpdatedAt: document.yjsUpdatedAt,
			_creationTime: document._creationTime,
		};
	},
});



/**
 * Subscribe to document version history updates
 * Useful for undo/redo functionality and version tracking
 */
export const subscribeToDocumentVersions = query({
	args: {
		documentId: v.id("documents"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { documentId, limit = 10 }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentAccess(ctx, documentId, userId);

		const versions = await ctx.db
			.query("documentVersions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.order("desc")
			.take(limit);

		// Include user information for each version
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

// ============================================================================
// USER PRESENCE SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to user presence in a specific document
 * Shows who is currently active/viewing the document
 */
export const subscribeToDocumentPresence = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentAccess(ctx, documentId, userId);

		// Get active sessions (users seen in last 2 minutes)
		const twoMinutesAgo = Date.now() - 120000;
		const activeSessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), twoMinutesAgo))
			.collect();

		// Get user information for each active session
		const activeUsers = await Promise.all(
			activeSessions.map(async (session) => {
				const user = await ctx.db.get(session.userId);
				return {
					userId: session.userId,
					name: user?.name || user?.email || "Anonymous",
					email: user?.email,
					lastSeen: session.lastSeen,
					isCurrentUser: session.userId === userId,
				};
			}),
		);

		return activeUsers;
	},
});

/**
 * Get active collaborators for a document with their current status
 * Optimized query for showing collaboration indicators
 */
export const getActiveCollaborators = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		// Get recent sessions (last 5 minutes)
		const fiveMinutesAgo = Date.now() - 300000;
		const recentSessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), fiveMinutesAgo))
			.collect();

		// Group by user and get the most recent session for each
		const userSessions = new Map<Id<"users">, typeof recentSessions[0]>();
		for (const session of recentSessions) {
			const existing = userSessions.get(session.userId);
			if (!existing || session.lastSeen > existing.lastSeen) {
				userSessions.set(session.userId, session);
			}
		}

		// Get user details and format response
		const collaborators = await Promise.all(
			Array.from(userSessions.values()).map(async (session) => {
				const user = await ctx.db.get(session.userId);
				const isActive = session.lastSeen > Date.now() - 120000; // Active in last 2 minutes

				return {
					userId: session.userId,
					name: user?.name || user?.email || "Anonymous",
					email: user?.email,
					lastSeen: session.lastSeen,
					isActive,
					isCurrentUser: session.userId === userId,
					isOwner: document.ownerId === session.userId,
					isCollaborator: document.collaborators?.includes(session.userId) || false,
				};
			}),
		);

		return collaborators.sort((a, b) => b.lastSeen - a.lastSeen);
	},
});

// ============================================================================
// COLLABORATIVE STATE SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to real-time collaboration state (cursors, selections)
 * Optimized for frequent updates during collaborative editing
 */
export const subscribeToCollaborationState = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentAccess(ctx, documentId, userId);

		// Get active collaboration sessions (last 30 seconds for real-time cursors)
		const thirtySecondsAgo = Date.now() - 30000;
		const activeSessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), thirtySecondsAgo))
			.collect();

		// Filter out current user's session and format for real-time updates
		const otherUsersSessions = activeSessions.filter(
			(session) => session.userId !== userId,
		);

		const collaborationState = await Promise.all(
			otherUsersSessions.map(async (session) => {
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

		return collaborationState;
	},
});

/**
 * Subscribe to document activity feed
 * Shows recent changes, collaborator joins/leaves, etc.
 */
export const subscribeToDocumentActivity = query({
	args: {
		documentId: v.id("documents"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { documentId, limit = 20 }) => {
		const userId = await getCurrentUser(ctx);
		await checkDocumentAccess(ctx, documentId, userId);

		// Get recent document versions as activity
		const recentVersions = await ctx.db
			.query("documentVersions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.order("desc")
			.take(limit);

		// Get recent collaboration sessions for join/leave activity
		const oneHourAgo = Date.now() - 3600000;
		const recentSessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.filter((q) => q.gt(q.field("lastSeen"), oneHourAgo))
			.collect();

		// Combine and format activity items
		const versionActivity = await Promise.all(
			recentVersions.map(async (version) => {
				const user = await ctx.db.get(version.createdBy);
				return {
					type: "version_created" as const,
					timestamp: version.createdAt,
					userId: version.createdBy,
					userName: user?.name || user?.email || "Anonymous",
					data: {
						version: version.version,
						documentId: version.documentId,
					},
				};
			}),
		);

		// Group sessions by user to detect join events
		const userFirstSeen = new Map<Id<"users">, number>();
		for (const session of recentSessions) {
			const existing = userFirstSeen.get(session.userId);
			if (!existing || session.lastSeen < existing) {
				userFirstSeen.set(session.userId, session.lastSeen);
			}
		}

		const joinActivity = await Promise.all(
			Array.from(userFirstSeen.entries()).map(async ([userId, timestamp]) => {
				const user = await ctx.db.get(userId);
				return {
					type: "user_joined" as const,
					timestamp,
					userId,
					userName: user?.name || user?.email || "Anonymous",
					data: { documentId },
				};
			}),
		);

		// Combine all activities and sort by timestamp
		const allActivity = [...versionActivity, ...joinActivity].sort(
			(a, b) => b.timestamp - a.timestamp,
		);

		return allActivity.slice(0, limit);
	},
});

/**
 * Get collaboration summary for a document
 * Provides overview statistics for collaboration features
 */
export const getCollaborationSummary = query({
	args: { documentId: v.id("documents") },
	handler: async (ctx, { documentId }) => {
		const userId = await getCurrentUser(ctx);
		const document = await checkDocumentAccess(ctx, documentId, userId);

		// Count total versions
		const totalVersions = await ctx.db
			.query("documentVersions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();

		// Count unique collaborators (all time)
		const allSessions = await ctx.db
			.query("collaborationSessions")
			.withIndex("by_document", (q) => q.eq("documentId", documentId))
			.collect();

		const uniqueCollaborators = new Set(allSessions.map((s) => s.userId));

		// Count active collaborators (last hour)
		const oneHourAgo = Date.now() - 3600000;
		const recentSessions = allSessions.filter((s) => s.lastSeen > oneHourAgo);
		const activeCollaborators = new Set(recentSessions.map((s) => s.userId));

		// Get latest version info
		const latestVersion = totalVersions.sort((a, b) => b.createdAt - a.createdAt)[0];
		const latestVersionUser = latestVersion
			? await ctx.db.get(latestVersion.createdBy)
			: null;

		return {
			documentId,
			totalVersions: totalVersions.length,
			totalCollaborators: uniqueCollaborators.size,
			activeCollaborators: activeCollaborators.size,
			lastUpdated: document.updatedAt,
			latestVersion: latestVersion
				? {
						version: latestVersion.version,
						createdAt: latestVersion.createdAt,
						createdBy: {
							_id: latestVersion.createdBy,
							name: latestVersionUser?.name || latestVersionUser?.email || "Anonymous",
						},
				  }
				: null,
		};
	},
});
