import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { checkFolderAccess, getCurrentUser } from "./authHelpers";

/**
 * Query to get all folders for the current user
 */
export const getUserFolders = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("folders"),
			name: v.string(),
			color: v.optional(v.string()),
			parentId: v.optional(v.id("folders")),
			ownerId: v.id("users"),
			createdAt: v.number(),
			updatedAt: v.number(),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx) => {
		const userId = await getCurrentUser(ctx);

		return await ctx.db
			.query("folders")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.order("desc")
			.collect();
	},
});

/**
 * Query to get folder tree structure for the current user
 */
export const getFolderTree = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("folders"),
			name: v.string(),
			color: v.optional(v.string()),
			parentId: v.optional(v.id("folders")),
			ownerId: v.id("users"),
			createdAt: v.number(),
			updatedAt: v.number(),
			_creationTime: v.number(),
			children: v.array(v.any()), // Recursive structure
		}),
	),
	handler: async (ctx) => {
		const userId = await getCurrentUser(ctx);

		const allFolders = await ctx.db
			.query("folders")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();

		// Build tree structure
		const folderMap = new Map<Id<"folders">, any>();
		const rootFolders: any[] = [];

		// First pass: create folder objects with children array
		for (const folder of allFolders) {
			folderMap.set(folder._id, {
				...folder,
				children: [],
			});
		}

		// Second pass: build parent-child relationships
		for (const folder of allFolders) {
			const folderWithChildren = folderMap.get(folder._id)!;
			if (folder.parentId) {
				const parent = folderMap.get(folder.parentId);
				if (parent) {
					parent.children.push(folderWithChildren);
				} else {
					// Parent not found, treat as root
					rootFolders.push(folderWithChildren);
				}
			} else {
				rootFolders.push(folderWithChildren);
			}
		}

		return rootFolders;
	},
});

/**
 * Query to get a specific folder by ID
 */
export const getFolder = query({
	args: { folderId: v.id("folders") },
	returns: v.object({
		_id: v.id("folders"),
		name: v.string(),
		color: v.optional(v.string()),
		parentId: v.optional(v.id("folders")),
		ownerId: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
		_creationTime: v.number(),
	}),
	handler: async (ctx, { folderId }) => {
		const userId = await getCurrentUser(ctx);
		return await checkFolderAccess(ctx, folderId, userId);
	},
});

/**
 * Mutation to create a new folder
 */
export const createFolder = mutation({
	args: {
		name: v.string(),
		color: v.optional(v.string()),
		parentId: v.optional(v.id("folders")),
	},
	returns: v.id("folders"),
	handler: async (ctx, { name, color, parentId }) => {
		const userId = await getCurrentUser(ctx);

		// Validate folder name
		if (name.trim().length === 0) {
			throw new ConvexError("Folder name cannot be empty");
		}
		if (name.length > 100) {
			throw new ConvexError("Folder name cannot exceed 100 characters");
		}

		// Validate parent folder if provided
		if (parentId) {
			await checkFolderAccess(ctx, parentId, userId);
		}

		// Validate color format if provided
		if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
			throw new ConvexError(
				"Color must be a valid hex color code (e.g., #FF0000)",
			);
		}

		const now = Date.now();
		return await ctx.db.insert("folders", {
			name: name.trim(),
			color,
			parentId,
			ownerId: userId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Mutation to update a folder
 */
export const updateFolder = mutation({
	args: {
		folderId: v.id("folders"),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
		parentId: v.optional(v.id("folders")),
	},
	returns: v.id("folders"),
	handler: async (ctx, { folderId, name, color, parentId }) => {
		const userId = await getCurrentUser(ctx);
		await checkFolderAccess(ctx, folderId, userId);

		// Validate folder name if provided
		if (name !== undefined) {
			if (name.trim().length === 0) {
				throw new ConvexError("Folder name cannot be empty");
			}
			if (name.length > 100) {
				throw new ConvexError("Folder name cannot exceed 100 characters");
			}
		}

		// Validate parent folder if provided
		if (parentId !== undefined) {
			if (parentId === folderId) {
				throw new ConvexError("Folder cannot be its own parent");
			}
			if (parentId) {
				await checkFolderAccess(ctx, parentId, userId);
				// TODO: Add circular reference check for nested folders
			}
		}

		// Validate color format if provided
		if (color !== undefined && color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
			throw new ConvexError(
				"Color must be a valid hex color code (e.g., #FF0000)",
			);
		}

		const updates: Partial<{
			name: string;
			color: string | undefined;
			parentId: Id<"folders"> | undefined;
			updatedAt: number;
		}> = {
			updatedAt: Date.now(),
		};

		if (name !== undefined) updates.name = name.trim();
		if (color !== undefined) updates.color = color;
		if (parentId !== undefined) updates.parentId = parentId;

		await ctx.db.patch(folderId, updates);
		return folderId;
	},
});

/**
 * Mutation to delete a folder
 */
export const deleteFolder = mutation({
	args: { folderId: v.id("folders") },
	returns: v.id("folders"),
	handler: async (ctx, { folderId }) => {
		const userId = await getCurrentUser(ctx);
		await checkFolderAccess(ctx, folderId, userId);

		// Check if folder has child folders
		const childFolders = await ctx.db
			.query("folders")
			.withIndex("by_parent", (q) => q.eq("parentId", folderId))
			.collect();

		if (childFolders.length > 0) {
			throw new ConvexError(
				"Cannot delete folder that contains subfolders. Please delete or move subfolders first.",
			);
		}

		// Check if folder has documents
		const documentsInFolder = await ctx.db
			.query("documents")
			.withIndex("by_folder", (q) => q.eq("folderId", folderId))
			.collect();

		if (documentsInFolder.length > 0) {
			throw new ConvexError(
				"Cannot delete folder that contains documents. Please move or delete documents first.",
			);
		}

		await ctx.db.delete(folderId);
		return folderId;
	},
});
