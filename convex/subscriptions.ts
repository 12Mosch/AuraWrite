import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { checkDocumentAccess, getCurrentUser } from "./authHelpers";

/**
 * Helper function to enrich a document with user details (collaborators and owner)
 * Fetches user data efficiently and returns the enriched document object
 */
async function enrichDocumentWithUserDetails(
	ctx: QueryCtx,
	document: Doc<"documents">,
	callerId?: Id<"users">,
) {
	// Determine if caller is a manager (owner or editor) to gate collaborator details.
	let isManager = false;
	if (callerId !== undefined) {
		if (document.ownerId === callerId) {
			isManager = true;
		} else if (document.collaborators && document.collaborators.length > 0) {
			// Check documentCollaborators table for an editor role for the caller.
			const compositeKey = `${String(document._id)}|${String(callerId)}`;
			const rows = await ctx.db
				.query("documentCollaborators")
				.withIndex("by_compositeKey", (q) => q.eq("compositeKey", compositeKey))
				.collect();
			if (rows.some((r) => r.role === "editor")) {
				isManager = true;
			}
		}
	}
	// Optimize user fetching by collecting all user IDs (collaborators + owner)
	const allUserIds = isManager
		? [...(document.collaborators || []), document.ownerId]
		: [document.ownerId];
	const uniqueUserIds = [...new Set(allUserIds)];

	// Batch fetch all users
	const users = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));

	// Create a map for efficient lookups
	const userMap = new Map(
		users
			.filter((user): user is NonNullable<typeof user> => user !== null)
			.map((user) => [user._id, user]),
	);

	// Get collaborator details using cached data
	const collaboratorDetails = isManager
		? (document.collaborators || [])
				.map((collaboratorId) => {
					const user = userMap.get(collaboratorId);
					return user
						? {
								_id: user._id,
								name: user.name,
								email: user.email,
								image: user.image,
							}
						: null;
				})
				.filter(Boolean)
		: [];

	// Get owner details using cached data
	const owner = userMap.get(document.ownerId);

	return {
		_id: document._id,
		title: document.title,
		isPublic: document.isPublic || false,
		collaborators: collaboratorDetails.filter(Boolean),
		owner: owner
			? {
					_id: owner._id,
					name: owner.name,
					email: owner.email,
					image: owner.image,
				}
			: null,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
		yjsUpdatedAt: document.yjsUpdatedAt,
		_creationTime: document._creationTime,
	};
}

// ============================================================================
// DOCUMENT CHANGES SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to real-time document content changes
 * Optimized for efficient real-time updates of document content
 */
export const subscribeToDocument = query({
	args: {
		documentId: v.id("documents"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { documentId, limit: _limit = 50 }) => {
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

		return await enrichDocumentWithUserDetails(ctx, document, userId);
	},
});

/**
 * Subscribe to multiple documents' metadata in a single batch query
 * Optimized for document lists and dashboards to reduce query count
 */
export const subscribeToMultipleDocumentMetadata = query({
	args: { documentIds: v.array(v.id("documents")) },
	handler: async (ctx, { documentIds }) => {
		const userId = await getCurrentUser(ctx);

		// Get all documents that the user has access to
		const documentsWithMetadata = await Promise.all(
			documentIds.map(async (documentId) => {
				try {
					const document = await checkDocumentAccess(ctx, documentId, userId);
					return await enrichDocumentWithUserDetails(ctx, document, userId);
				} catch (_error) {
					// If user doesn't have access to a document, skip it
					// This allows partial results for mixed access scenarios
					return null;
				}
			}),
		);

		// Filter out null results (documents user doesn't have access to)
		return documentsWithMetadata.filter(Boolean);
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

		// Optimize user fetching by collecting unique user IDs first
		const uniqueUserIds = [...new Set(versions.map((v) => v.createdBy))];

		// Batch fetch all unique users
		const users = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));

		// Create a map for efficient lookups
		const userMap = new Map(
			users
				.filter((user): user is NonNullable<typeof user> => user !== null)
				.map((user) => [user._id, user]),
		);

		// Include user information for each version using cached data
		const versionsWithUsers = versions.map((version) => {
			const user = userMap.get(version.createdBy);
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
		});

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

		// Optimize user fetching by collecting unique user IDs first
		const uniqueUserIds = [...new Set(activeSessions.map((s) => s.userId))];

		// Batch fetch all unique users
		const users = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));

		// Create a map for efficient lookups
		const userMap = new Map(
			users
				.filter((user): user is NonNullable<typeof user> => user !== null)
				.map((user) => [user._id, user]),
		);

		// Map sessions with user data using the cached user data
		const activeUsers = activeSessions.map((session) => {
			const user = userMap.get(session.userId);
			return {
				userId: session.userId,
				name: user?.name || user?.email || "Anonymous",
				email: user?.email,
				lastSeen: session.lastSeen,
				isCurrentUser: session.userId === userId,
			};
		});

		return activeUsers;
	},
});

/**
 * Get active collaborators for a document with their current status
 * Optimized query for showing collaboration indicators
 */
export const getActiveCollaborators = query({
	args: {
		documentId: v.id("documents"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { documentId, limit = 50 }) => {
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
		const userSessions = new Map<Id<"users">, (typeof recentSessions)[0]>();
		for (const session of recentSessions) {
			const existing = userSessions.get(session.userId);
			if (!existing || session.lastSeen > existing.lastSeen) {
				userSessions.set(session.userId, session);
			}
		}

		// Get limited sessions for processing
		const limitedSessions = Array.from(userSessions.values()).slice(0, limit);

		// Optimize user fetching by collecting unique user IDs first
		const uniqueUserIds = [...new Set(limitedSessions.map((s) => s.userId))];

		// Batch fetch all unique users
		const users = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));

		// Create a map for efficient lookups
		const userMap = new Map(
			users
				.filter((user): user is NonNullable<typeof user> => user !== null)
				.map((user) => [user._id, user]),
		);

		// Get user details and format response using cached user data
		const collaborators = limitedSessions.map((session) => {
			const user = userMap.get(session.userId);
			const isActive = session.lastSeen > Date.now() - 120000; // Active in last 2 minutes

			return {
				userId: session.userId,
				name: user?.name || user?.email || "Anonymous",
				email: user?.email,
				lastSeen: session.lastSeen,
				isActive,
				isCurrentUser: session.userId === userId,
				isOwner: document.ownerId === session.userId,
				isCollaborator:
					document.collaborators?.includes(session.userId) || false,
			};
		});

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

		// Optimize user fetching by collecting unique user IDs first
		const uniqueUserIds = [...new Set(otherUsersSessions.map((s) => s.userId))];

		// Batch fetch all unique users
		const users = await Promise.all(uniqueUserIds.map((id) => ctx.db.get(id)));

		// Create a map for efficient lookups
		const userMap = new Map(
			users
				.filter((user): user is NonNullable<typeof user> => user !== null)
				.map((user) => [user._id, user]),
		);

		const collaborationState = otherUsersSessions.map((session) => {
			const user = userMap.get(session.userId);
			return {
				userId: session.userId,
				userName: user?.name || user?.email || "Anonymous",
				cursor: session.cursor,
				selection: session.selection,
				lastSeen: session.lastSeen,
			};
		});

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

		// Optimize user fetching for version activity
		const versionUserIds = [...new Set(recentVersions.map((v) => v.createdBy))];
		const versionUsers = await Promise.all(
			versionUserIds.map((id) => ctx.db.get(id)),
		);
		const versionUserMap = new Map(
			versionUsers
				.filter((user): user is NonNullable<typeof user> => user !== null)
				.map((user) => [user._id, user]),
		);

		// Combine and format activity items using cached user data
		const versionActivity = recentVersions.map((version) => {
			const user = versionUserMap.get(version.createdBy);
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
		});

		// Group sessions by user to detect join events
		const userFirstSeen = new Map<Id<"users">, number>();
		for (const session of recentSessions) {
			const existing = userFirstSeen.get(session.userId);
			if (!existing || session.lastSeen > existing) {
				userFirstSeen.set(session.userId, session.lastSeen);
			}
		}

		// Optimize user fetching for join activity
		const joinUserIds = [...new Set(Array.from(userFirstSeen.keys()))];
		const joinUsers = await Promise.all(
			joinUserIds.map((id) => ctx.db.get(id)),
		);
		const joinUserMap = new Map(
			joinUsers
				.filter((user): user is NonNullable<typeof user> => user !== null)
				.map((user) => [user._id, user]),
		);

		const joinActivity = Array.from(userFirstSeen.entries()).map(
			([userId, timestamp]) => {
				const user = joinUserMap.get(userId);
				return {
					type: "user_joined" as const,
					timestamp,
					userId,
					userName: user?.name || user?.email || "Anonymous",
					data: { documentId },
				};
			},
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
		const latestVersion = totalVersions.sort(
			(a, b) => b.createdAt - a.createdAt,
		)[0];
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
							name:
								latestVersionUser?.name ||
								latestVersionUser?.email ||
								"Anonymous",
						},
					}
				: null,
		};
	},
});
