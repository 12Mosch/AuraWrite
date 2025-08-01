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
