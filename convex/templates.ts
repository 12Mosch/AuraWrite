import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
	checkTemplateAccess,
	checkTemplateEditAccess,
	getCurrentUser,
} from "./authHelpers";

/**
 * Query to get all templates accessible to the current user
 */
export const getTemplates = query({
	args: {
		category: v.optional(v.string()),
		includeTeamTemplates: v.optional(v.boolean()),
	},
	returns: v.array(
		v.object({
			_id: v.id("templates"),
			name: v.string(),
			description: v.optional(v.string()),
			content: v.string(),
			category: v.string(),
			isTeamTemplate: v.boolean(),
			createdBy: v.id("users"),
			createdAt: v.number(),
			updatedAt: v.number(),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx, { category, includeTeamTemplates = true }) => {
		const userId = await getCurrentUser(ctx);

		let templates = await ctx.db.query("templates").collect();

		// Filter by access permissions
		templates = templates.filter(
			(template) =>
				template.createdBy === userId ||
				(includeTeamTemplates && template.isTeamTemplate),
		);

		// Filter by category if provided
		if (category) {
			templates = templates.filter(
				(template) => template.category === category,
			);
		}

		// Sort by creation date (newest first)
		templates.sort((a, b) => b.createdAt - a.createdAt);

		return templates;
	},
});

/**
 * Query to get templates by category
 */
export const getTemplatesByCategory = query({
	args: {
		category: v.string(),
		includeTeamTemplates: v.optional(v.boolean()),
	},
	returns: v.array(
		v.object({
			_id: v.id("templates"),
			name: v.string(),
			description: v.optional(v.string()),
			content: v.string(),
			category: v.string(),
			isTeamTemplate: v.boolean(),
			createdBy: v.id("users"),
			createdAt: v.number(),
			updatedAt: v.number(),
			_creationTime: v.number(),
		}),
	),
	handler: async (ctx, { category, includeTeamTemplates = true }) => {
		const userId = await getCurrentUser(ctx);

		let templates = await ctx.db
			.query("templates")
			.withIndex("by_category", (q) => q.eq("category", category))
			.collect();

		// Filter by access permissions
		templates = templates.filter(
			(template) =>
				template.createdBy === userId ||
				(includeTeamTemplates && template.isTeamTemplate),
		);

		// Sort by creation date (newest first)
		templates.sort((a, b) => b.createdAt - a.createdAt);

		return templates;
	},
});

/**
 * Query to get a specific template by ID
 */
export const getTemplate = query({
	args: { templateId: v.id("templates") },
	returns: v.object({
		_id: v.id("templates"),
		name: v.string(),
		description: v.optional(v.string()),
		content: v.string(),
		category: v.string(),
		isTeamTemplate: v.boolean(),
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
		_creationTime: v.number(),
	}),
	handler: async (ctx, { templateId }) => {
		const userId = await getCurrentUser(ctx);
		return await checkTemplateAccess(ctx, templateId, userId);
	},
});

/**
 * Query to get template categories available to the user
 */
export const getTemplateCategories = query({
	args: {},
	returns: v.array(v.string()),
	handler: async (ctx) => {
		const userId = await getCurrentUser(ctx);

		const templates = await ctx.db.query("templates").collect();

		// Filter by access permissions
		const accessibleTemplates = templates.filter(
			(template) => template.createdBy === userId || template.isTeamTemplate,
		);

		// Extract unique categories
		const categories = [...new Set(accessibleTemplates.map((t) => t.category))];
		return categories.sort();
	},
});

/**
 * Mutation to create a new template
 */
export const createTemplate = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		content: v.string(),
		category: v.string(),
		isTeamTemplate: v.optional(v.boolean()),
	},
	returns: v.id("templates"),
	handler: async (
		ctx,
		{ name, description, content, category, isTeamTemplate = false },
	) => {
		const userId = await getCurrentUser(ctx);

		// Validate template name
		if (name.trim().length === 0) {
			throw new ConvexError("Template name cannot be empty");
		}
		if (name.length > 200) {
			throw new ConvexError("Template name cannot exceed 200 characters");
		}

		// Validate description if provided
		if (description && description.length > 500) {
			throw new ConvexError(
				"Template description cannot exceed 500 characters",
			);
		}

		// Validate content
		if (content.trim().length === 0) {
			throw new ConvexError("Template content cannot be empty");
		}
		if (content.length > 1000000) {
			throw new ConvexError("Template content cannot exceed 1MB");
		}

		// Validate category
		if (category.trim().length === 0) {
			throw new ConvexError("Template category cannot be empty");
		}
		if (category.length > 50) {
			throw new ConvexError("Template category cannot exceed 50 characters");
		}

		const now = Date.now();
		return await ctx.db.insert("templates", {
			name: name.trim(),
			description: description?.trim(),
			content,
			category: category.trim(),
			isTeamTemplate,
			createdBy: userId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Mutation to update a template
 */
export const updateTemplate = mutation({
	args: {
		templateId: v.id("templates"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		content: v.optional(v.string()),
		category: v.optional(v.string()),
		isTeamTemplate: v.optional(v.boolean()),
	},
	returns: v.id("templates"),
	handler: async (
		ctx,
		{ templateId, name, description, content, category, isTeamTemplate },
	) => {
		const userId = await getCurrentUser(ctx);
		await checkTemplateEditAccess(ctx, templateId, userId);

		// Validate template name if provided
		if (name !== undefined) {
			if (name.trim().length === 0) {
				throw new ConvexError("Template name cannot be empty");
			}
			if (name.length > 200) {
				throw new ConvexError("Template name cannot exceed 200 characters");
			}
		}

		// Validate description if provided
		if (description !== undefined && description && description.length > 500) {
			throw new ConvexError(
				"Template description cannot exceed 500 characters",
			);
		}

		// Validate content if provided
		if (content !== undefined) {
			if (content.trim().length === 0) {
				throw new ConvexError("Template content cannot be empty");
			}
			if (content.length > 1000000) {
				throw new ConvexError("Template content cannot exceed 1MB");
			}
		}

		// Validate category if provided
		if (category !== undefined) {
			if (category.trim().length === 0) {
				throw new ConvexError("Template category cannot be empty");
			}
			if (category.length > 50) {
				throw new ConvexError("Template category cannot exceed 50 characters");
			}
		}

		const updates: Partial<{
			name: string;
			description: string | undefined;
			content: string;
			category: string;
			isTeamTemplate: boolean;
			updatedAt: number;
		}> = {
			updatedAt: Date.now(),
		};

		if (name !== undefined) updates.name = name.trim();
		if (description !== undefined) updates.description = description?.trim();
		if (content !== undefined) updates.content = content;
		if (category !== undefined) updates.category = category.trim();
		if (isTeamTemplate !== undefined) updates.isTeamTemplate = isTeamTemplate;

		await ctx.db.patch(templateId, updates);
		return templateId;
	},
});

/**
 * Mutation to delete a template
 */
export const deleteTemplate = mutation({
	args: { templateId: v.id("templates") },
	returns: v.id("templates"),
	handler: async (ctx, { templateId }) => {
		const userId = await getCurrentUser(ctx);
		await checkTemplateEditAccess(ctx, templateId, userId);

		await ctx.db.delete(templateId);
		return templateId;
	},
});

/**
 * Mutation to create a document from a template
 */
export const createDocumentFromTemplate = mutation({
	args: {
		templateId: v.id("templates"),
		title: v.string(),
		folderId: v.optional(v.id("folders")),
	},
	returns: v.id("documents"),
	handler: async (ctx, { templateId, title, folderId }) => {
		const userId = await getCurrentUser(ctx);
		const template = await checkTemplateAccess(ctx, templateId, userId);

		// Validate title
		if (title.trim().length === 0) {
			throw new ConvexError("Document title cannot be empty");
		}
		if (title.length > 200) {
			throw new ConvexError("Document title cannot exceed 200 characters");
		}

		// Validate folder if provided
		if (folderId) {
			const folder = await ctx.db.get(folderId);
			if (!folder || folder.ownerId !== userId) {
				throw new ConvexError("Invalid folder or access denied");
			}
		}

		const now = Date.now();
		return await ctx.db.insert("documents", {
			title: title.trim(),
			content: template.content,
			ownerId: userId,
			isPublic: false,
			collaborators: [],
			createdAt: now,
			updatedAt: now,
			templateId,
			folderId,
			status: "draft",
			tags: [],
			isFavorite: false,
		});
	},
});
