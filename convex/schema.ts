import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Define the schema with auth tables and document tables
const schema = defineSchema({
	// Include auth tables required by Convex Auth
	...authTables,

	// Documents table for collaborative editing
	documents: defineTable({
		title: v.string(),
		content: v.optional(v.string()), // Slate.js content as JSON string
		ownerId: v.id("users"), // Reference to the user who created the document
		isPublic: v.optional(v.boolean()), // Whether the document is publicly accessible
		collaborators: v.optional(v.array(v.id("users"))), // Array of user IDs who can edit
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_owner", ["ownerId"])
		.index("by_updated", ["updatedAt"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["ownerId", "isPublic"],
		}),

	// Document versions for history/undo functionality
	documentVersions: defineTable({
		documentId: v.id("documents"),
		content: v.string(), // Slate.js content as JSON string
		version: v.number(),
		createdBy: v.id("users"),
		createdAt: v.number(),
	})
		.index("by_document", ["documentId"])
		.index("by_document_version", ["documentId", "version"]),

	// Real-time collaboration cursors and selections
	collaborationSessions: defineTable({
		documentId: v.id("documents"),
		userId: v.id("users"),
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
		lastSeen: v.number(),
	})
		.index("by_document", ["documentId"])
		.index("by_user_document", ["userId", "documentId"])
		.index("by_document_last_seen", ["documentId", "lastSeen"]), // Optimized for time-based queries
});

export default schema;
