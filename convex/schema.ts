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
		})
		// Additional indexes referenced in DATA_MODEL.md for common filtered queries.
		// by_template: fast lookup of documents created from a given template
		.index("by_template", ["templateId"])
		// by_public: quick filtering by public visibility
		.index("by_public", ["isPublic"]),

	// Document versions for history/undo functionality
	documentVersions: defineTable({
		documentId: v.id("documents"),
		content: v.string(), // Slate.js content as JSON string
		version: v.number(),
		createdBy: v.id("users"),
		createdAt: v.number(),
		// Canonical Y.Doc snapshot (binary) to restore exact runtime state for rollbacks
		yjsSnapshot: v.optional(v.bytes()),
		// Protocol/schema version for the Yjs snapshot (numeric, increment on breaking changes)
		yjsProtocolVersion: v.optional(v.number()),
	})
		.index("by_document", ["documentId"])
		.index("by_document_version", ["documentId", "version"]),

	// Per-user local file paths for documents.
	// This isolates filesystem/PII from the main `documents` table and is keyed by
	// { documentId, userId }. Writes to this table should be restricted to the
	// authenticated caller (owner or the writing userId) in mutations — see Convex
	// server-side mutations for enforcement. Clients may also choose to keep file
	// paths entirely client-only and not persist them.
	documentLocalPaths: defineTable({
		documentId: v.id("documents"),
		userId: v.id("users"),
		// Synthetic composite key to enforce a single row per (userId, documentId).
		// Convex compound indexes are not unique, so we store a deterministic
		// compositeKey string (e.g. "<userId>|<documentId>") and index it to allow
		// lookups and deterministic upsert semantics.
		compositeKey: v.string(),
		// Local filesystem path saved by this particular user (optional).
		// Keep sensitive values out of default queries/responses where possible.
		filePath: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user_document", ["userId", "documentId"])
		.index("by_document_user", ["documentId", "userId"])
		// Enforce a single-row-per-pair behavior by indexing the synthetic composite key.
		.index("by_compositeKey", ["compositeKey"]),

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
		.index("by_document_last_seen", ["documentId", "lastSeen"]) // Optimized for time-based queries
		// Additional index for reverse lookup (document -> user) used by presence lists/UI
		.index("by_document_user", ["documentId", "userId"]),

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
		// Composite index to support listing templates by creator ordered by update time
		.index("by_creator_updated", ["createdBy", "updatedAt"])
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
		.index("by_user_created", ["userId", "createdAt"])
		// Composite index used to enforce/lookup saved-search names per user
		.index("by_user_name", ["userId", "name"]),

	// Search history table for autocomplete and recent searches
	searchHistory: defineTable({
		query: v.string(), // The search query string
		userId: v.id("users"), // Reference to the user who performed the search
		searchedAt: v.number(), // Timestamp when the search was performed
		resultCount: v.optional(v.number()), // Number of results returned (for analytics)
	})
		.index("by_user", ["userId"])
		.index("by_user_searched", ["userId", "searchedAt"])
		.index("by_searchedAt", ["searchedAt"])
		.index("by_query", ["query"]),

	// Sharing: collaborator roles per document
	documentCollaborators: defineTable({
		documentId: v.id("documents"),
		userId: v.id("users"),
		// Synthetic composite key to enforce a single row per (documentId, userId).
		// Convex compound indexes are not unique, so we store a deterministic
		// compositeKey string (e.g. "<documentId>|<userId>") and index it to allow
		// lookups and deterministic upsert semantics.
		compositeKey: v.string(),
		role: v.union(
			v.literal("viewer"),
			v.literal("commenter"),
			v.literal("editor"),
		),
		addedBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_document", ["documentId"])
		.index("by_user_document", ["userId", "documentId"])
		// Enforce a single-row-per-pair behavior by indexing the synthetic composite key.
		.index("by_compositeKey", ["compositeKey"]),

	// Sharing: link-based access tokens for documents
	// NOTE: We store a one-way hash of the share token (e.g. SHA-256) and never
	// persist or return the raw plaintext token. The raw token is only returned
	// once at creation time to the caller. This prevents accidental exposure if
	// the DB is read or logs are leaked.
	shareTokens: defineTable({
		documentId: v.id("documents"),
		// SHA-256 hash (base64url) of the opaque token; never store plaintext
		tokenHash: v.string(),
		role: v.union(
			v.literal("viewer"),
			v.literal("commenter"),
			v.literal("editor"),
		),
		createdBy: v.id("users"),
		createdAt: v.number(),
		expiresAt: v.optional(v.number()),
		// Soft-revocation metadata (optional) to support auditability instead of hard deletes.
		revokedAt: v.optional(v.number()),
		revokedBy: v.optional(v.id("users")),
	})
		.index("by_document", ["documentId"])
		.index("by_document_role", ["documentId", "role"])
		.index("by_createdBy", ["createdBy"])
		// For token verification: document + tokenHash
		.index("by_document_tokenHash", ["documentId", "tokenHash"])
		// For periodic cleanup of expired tokens
		.index("by_expiresAt", ["expiresAt"]),
});

export default schema;
