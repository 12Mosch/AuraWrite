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
		content: v.optional(v.string()), // Slate.js content as JSON string (legacy)
		yjsState: v.optional(v.bytes()), // Y.Doc binary state for real-time collaboration
		yjsStateVector: v.optional(v.bytes()), // Y.Doc state vector for efficient sync
		ownerId: v.id("users"), // Reference to the user who created the document
		isPublic: v.optional(v.boolean()), // Whether the document is publicly accessible
		collaborators: v.optional(v.array(v.id("users"))), // Array of user IDs who can edit
		createdAt: v.number(),
		updatedAt: v.number(),
		yjsUpdatedAt: v.optional(v.number()), // Last Y.Doc update timestamp
		tags: v.optional(v.array(v.string())), // Document tags for organization
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("published"),
				v.literal("archived"),
			),
		), // Document status
		folderId: v.optional(v.id("folders")), // Reference to parent folder
		templateId: v.optional(v.id("templates")), // Reference to template used to create document
		lastAccessedAt: v.optional(v.number()), // Last time document was accessed
		isFavorite: v.optional(v.boolean()), // Whether document is marked as favorite
	})
		.index("by_owner", ["ownerId"])
		.index("by_updated", ["updatedAt"])
		.index("by_folder", ["folderId"])
		.index("by_folder_owner", ["folderId", "ownerId"])
		.index("by_status", ["status"])
		.index("by_owner_status", ["ownerId", "status"])
		.index("by_favorite", ["ownerId", "isFavorite"])
		.index("by_last_accessed", ["lastAccessedAt"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["ownerId", "isPublic", "status", "folderId"],
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

	// Folders table for document organization
	folders: defineTable({
		name: v.string(),
		color: v.optional(v.string()), // Hex color code for folder display
		parentId: v.optional(v.id("folders")), // Reference to parent folder for nested structure
		ownerId: v.id("users"), // Reference to the user who created the folder
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_owner", ["ownerId"])
		.index("by_parent", ["parentId"])
		.index("by_owner_parent", ["ownerId", "parentId"]), // Optimized for folder tree queries

	// Templates table for document templates
	templates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		content: v.string(), // Template content as JSON string
		category: v.string(), // Template category (e.g., "business", "personal", "academic")
		isTeamTemplate: v.boolean(), // Whether template is available to team/organization
		createdBy: v.id("users"), // Reference to the user who created the template
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_creator", ["createdBy"])
		.index("by_category", ["category"])
		.index("by_team_template", ["isTeamTemplate"])
		.searchIndex("search_templates", {
			searchField: "name",
			filterFields: ["category", "isTeamTemplate", "createdBy"],
		}),

	// Saved searches table for user search preferences
	savedSearches: defineTable({
		name: v.string(), // User-defined name for the saved search
		query: v.optional(v.string()), // Search query string
		filters: v.object({
			folderId: v.optional(v.id("folders")),
			status: v.optional(
				v.union(
					v.literal("draft"),
					v.literal("published"),
					v.literal("archived"),
				),
			),
			tags: v.optional(v.array(v.string())),
			dateRange: v.optional(
				v.object({
					start: v.number(),
					end: v.number(),
				}),
			),
		}), // Filter criteria as structured object
		sortBy: v.optional(
			v.union(
				v.literal("title"),
				v.literal("updatedAt"),
				v.literal("createdAt"),
				v.literal("lastAccessedAt"),
			),
		),
		sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
		userId: v.id("users"), // Reference to the user who created the saved search
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_created", ["userId", "createdAt"]),

	// Search history table for autocomplete and recent searches
	searchHistory: defineTable({
		query: v.string(), // The search query string
		userId: v.id("users"), // Reference to the user who performed the search
		searchedAt: v.number(), // Timestamp when the search was performed
		resultCount: v.optional(v.number()), // Number of results returned (for analytics)
	})
		.index("by_user", ["userId"])
		.index("by_user_searched", ["userId", "searchedAt"])
		.index("by_query", ["query"])
		.index("by_user_query", ["userId", "query"]), // More efficient for user-specific deduplication
});

export default schema;
