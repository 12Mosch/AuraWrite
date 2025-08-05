import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { checkFolderAccess, getCurrentUser } from "./authHelpers";

// Type for folder with children for tree structure
type FolderWithChildren = Doc<"folders"> & {
	children: FolderWithChildren[];
};

// Maximum allowed nesting depth for folders to prevent excessively deep trees
// Depth definition: root (no parent) = depth 1; child of root = depth 2; etc.
const MAX_FOLDER_DEPTH = 10;

// Helper to compute depth by traversing parents; also detects cycles
async function getFolderDepthAndValidate(
	ctx: { db: { get: (id: Id<"folders">) => Promise<Doc<"folders"> | null> } },
	startParentId: Id<"folders"> | undefined,
	currentFolderId?: Id<"folders">,
): Promise<number> {
	let depth = 1; // default root depth if no parent
	if (!startParentId) return depth;

	// Track visited to prevent cycles
	const visited = new Set<string>();
	let nodeId: Id<"folders"> | undefined = startParentId;
	depth = 2; // child of root

	while (nodeId) {
		const key = nodeId as unknown as string;
		if (visited.has(key)) {
			throw new ConvexError("Invalid folder hierarchy: cycle detected");
		}
		visited.add(key);

		// Prevent setting parent to a descendant (when updating), by short-circuiting if we reach currentFolderId
		if (currentFolderId && nodeId === currentFolderId) {
			throw new ConvexError(
				"Invalid operation: folder cannot be nested within itself or its descendants",
			);
		}

		const node = await ctx.db.get(nodeId);
		if (!node) break;

		if (node.parentId) {
			depth += 1;
			if (depth > MAX_FOLDER_DEPTH) {
				throw new ConvexError(
					`Maximum folder nesting depth of ${MAX_FOLDER_DEPTH} exceeded`,
				);
			}
		}
		nodeId = node.parentId ?? undefined;
	}

	return depth;
}

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
			children: v.array(v.any()), // Recursive structure - v.any() required for recursive types in Convex
		}),
	),
	handler: async (ctx) => {
		const userId = await getCurrentUser(ctx);

		const allFolders = await ctx.db
			.query("folders")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();

		// Build tree structure
		const folderMap = new Map<Id<"folders">, FolderWithChildren>();
		const rootFolders: FolderWithChildren[] = [];

		// First pass: create folder objects with children array
		for (const folder of allFolders) {
			folderMap.set(folder._id, {
				...folder,
				children: [],
			});
		}

		// Second pass: build parent-child relationships
		for (const folder of allFolders) {
			const folderWithChildren = folderMap.get(folder._id);
			if (!folderWithChildren) {
				// This should never happen since we just added all folders in the first pass
				continue;
			}

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

			// Circular reference protection: walk up the parent chain from the new parentId.
			// If we ever encounter the folder being created (not possible here since it doesn't exist yet),
			// or detect a cycle via repeated ancestor, throw. For completeness, we also guard against
			// malformed existing data that already has cycles.
			{
				const visited = new Set<string>();
				let ancestorId: Id<"folders"> | undefined = parentId;
				while (ancestorId) {
					const key = ancestorId as unknown as string;
					if (visited.has(key)) {
						throw new ConvexError("Invalid folder hierarchy: cycle detected");
					}
					visited.add(key);

					const ancestor: Doc<"folders"> | null = await ctx.db.get(ancestorId);
					if (!ancestor) break;
					ancestorId = ancestor.parentId ?? undefined;
				}
			}

			// Enforce depth limit and validate no cycles
			await getFolderDepthAndValidate(ctx, parentId);
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

				// Circular reference protection: walk up from the proposed parent to ensure
				// we never reach the folder we're updating. This prevents making a descendant
				// the parent of its ancestor which would create a cycle.
				{
					const visited = new Set<string>();
					let ancestorId: Id<"folders"> | undefined = parentId;
					while (ancestorId) {
						const key = ancestorId as unknown as string;
						if (visited.has(key)) {
							throw new ConvexError("Invalid folder hierarchy: cycle detected");
						}
						visited.add(key);

						if (ancestorId === folderId) {
							throw new ConvexError(
								"Invalid operation: folder cannot be nested within itself or its descendants",
							);
						}
						const ancestor: Doc<"folders"> | null =
							await ctx.db.get(ancestorId);
						if (!ancestor) break;
						ancestorId = ancestor.parentId ?? undefined;
					}
				}

				// Enforce depth limit and prevent cycles/descendant parenting
				await getFolderDepthAndValidate(ctx, parentId, folderId);
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
