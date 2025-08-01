import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query to get current user information
export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return null;
		}

		return await ctx.db.get(userId);
	},
});

// Query to search for users by email (for collaboration)
export const searchUsers = query({
	args: {
		email: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { email, limit = 5 }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		// Search for users by email (case-insensitive partial match)
		const users = await ctx.db
			.query("users")
			.filter((q) =>
				q.and(
					q.neq(q.field("_id"), userId), // Exclude current user
					q.or(
						q.eq(q.field("email"), email),
						// Note: Convex doesn't support case-insensitive search directly
						// In a real app, you might want to store a normalized email field
					),
				),
			)
			.take(limit);

		return users.map((user) => ({
			_id: user._id,
			name: user.name || user.email || "Anonymous",
			email: user.email,
		}));
	},
});

// Query to get user by ID (for collaboration features)
export const getUserById = query({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId: targetUserId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const user = await ctx.db.get(targetUserId);
		if (!user) {
			return null;
		}

		return {
			_id: user._id,
			name: user.name || user.email || "Anonymous",
			email: user.email,
		};
	},
});

// Mutation to update user profile
export const updateProfile = mutation({
	args: {
		name: v.optional(v.string()),
	},
	handler: async (ctx, { name }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const updates: Partial<{ name: string }> = {};
		if (name !== undefined) updates.name = name;

		await ctx.db.patch(userId, updates);
		return userId;
	},
});

// Query to get user's document statistics
export const getUserStats = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		// Count owned documents
		const ownedDocuments = await ctx.db
			.query("documents")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();

		// Count documents where user is a collaborator
		const allDocuments = await ctx.db.query("documents").collect();
		const collaboratedDocuments = allDocuments.filter((doc) =>
			doc.collaborators?.includes(userId),
		);

		// Count recent activity (documents updated in last 7 days)
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const recentDocuments = ownedDocuments.filter(
			(doc) => doc.updatedAt > sevenDaysAgo,
		);

		return {
			ownedDocuments: ownedDocuments.length,
			collaboratedDocuments: collaboratedDocuments.length,
			recentActivity: recentDocuments.length,
			totalDocuments: ownedDocuments.length + collaboratedDocuments.length,
		};
	},
});
