import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * Helper function to get current authenticated user
 * Throws error if user is not authenticated
 */
export async function getCurrentUser(
	ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		throw new ConvexError("Authentication required to access this resource");
	}
	return userId;
}

/**
 * Helper function to check document access permissions
 * Verifies that a user has access to a document (owner, collaborator, or public)
 */
export async function checkDocumentAccess(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
	userId: Id<"users">,
): Promise<Doc<"documents">> {
	const document = await ctx.db.get(documentId);
	if (!document) {
		throw new ConvexError("Document not found");
	}

	const hasAccess =
		document.ownerId === userId ||
		document.isPublic ||
		document.collaborators?.includes(userId);

	if (!hasAccess) {
		throw new ConvexError(
			"Access denied: You don't have permission to access this document",
		);
	}

	return document;
}

/**
 * Helper function to check folder access permissions
 * Verifies that a user has access to a folder (owner only)
 */
export async function checkFolderAccess(
	ctx: QueryCtx | MutationCtx,
	folderId: Id<"folders">,
	userId: Id<"users">,
): Promise<Doc<"folders">> {
	const folder = await ctx.db.get(folderId);
	if (!folder) {
		throw new ConvexError("Folder not found");
	}

	if (folder.ownerId !== userId) {
		throw new ConvexError(
			"Access denied: You don't have permission to access this folder",
		);
	}

	return folder;
}

/**
 * Helper function to check template access permissions
 * Verifies that a user has access to a template (creator or team template)
 */
export async function checkTemplateAccess(
	ctx: QueryCtx | MutationCtx,
	templateId: Id<"templates">,
	userId: Id<"users">,
): Promise<Doc<"templates">> {
	const template = await ctx.db.get(templateId);
	if (!template) {
		throw new ConvexError("Template not found");
	}

	const hasAccess = template.createdBy === userId || template.isTeamTemplate;

	if (!hasAccess) {
		throw new ConvexError(
			"Access denied: You don't have permission to access this template",
		);
	}

	return template;
}

/**
 * Helper function to check template edit permissions
 * Verifies that a user can edit a template (creator only)
 */
export async function checkTemplateEditAccess(
	ctx: QueryCtx | MutationCtx,
	templateId: Id<"templates">,
	userId: Id<"users">,
): Promise<Doc<"templates">> {
	const template = await ctx.db.get(templateId);
	if (!template) {
		throw new ConvexError("Template not found");
	}

	if (template.createdBy !== userId) {
		throw new ConvexError(
			"Access denied: Only the template creator can edit this template",
		);
	}

	return template;
}
