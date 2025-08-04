import { useMutation, useQuery } from "convex/react";
import React, { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { SearchCriteria } from "./AdvancedSearchModal";
import { CreateDocumentModal } from "./CreateDocumentModal";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import { DragDropProvider } from "./DragDropProvider";
import type { FilterCriteria } from "./FilterPanel";
import { MainContent } from "./MainContent";

export type ViewMode = "grid" | "list";

export interface DocumentDashboardProps {
	className?: string;
	onDocumentOpen?: (documentId: Id<"documents">) => void;
	onSignOut?: () => void;
}

export const DocumentDashboard: React.FC<DocumentDashboardProps> = ({
	className,
	onDocumentOpen,
	onSignOut,
}) => {
	// State management
	const [viewMode, setViewMode] = useState<ViewMode>("grid");
	const [searchQuery, setSearchQuery] = useState("");
	const [filters, setFilters] = useState<FilterCriteria>({});
	const [selectedFolderId, setSelectedFolderId] = useState<
		Id<"folders"> | undefined
	>();
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [selectedDocuments, setSelectedDocuments] = useState<
		Set<Id<"documents">>
	>(new Set());
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [currentView, setCurrentView] = useState<
		"all" | "favorites" | "recent" | "drafts" | "archived"
	>("all");

	// Data fetching - use enhanced search when there's a query or filters, otherwise get all user documents
	const hasActiveFilters =
		searchQuery.trim() ||
		filters.folderId ||
		filters.status ||
		(filters.tags && filters.tags.length > 0) ||
		filters.isFavorite ||
		filters.dateRange;

	const userDocuments = useQuery(
		api.documents.getUserDocuments,
		hasActiveFilters ? undefined : {},
	);
	const recentDocuments = useQuery(
		api.documents.getRecentDocuments,
		currentView === "recent" ? { limit: 20 } : "skip",
	);
	const searchResults = useQuery(
		api.documents.searchDocuments,
		hasActiveFilters
			? {
					query: searchQuery.trim() || undefined,
					folderId: filters.folderId,
					status: filters.status,
					tags: filters.tags,
					limit: 50,
				}
			: "skip",
	);

	// Mutations
	const updateLastAccessed = useMutation(
		api.documents.updateDocumentLastAccessed,
	);

	// Use search results when searching/filtering, recent documents for recent view, otherwise use all user documents
	const filteredDocuments = React.useMemo(() => {
		if (currentView === "recent") {
			return recentDocuments || [];
		}

		if (hasActiveFilters) {
			let results = searchResults || [];

			// Apply client-side filters that aren't handled by the backend
			if (filters.isFavorite) {
				results = results.filter((doc) => doc.isFavorite);
			}

			return results;
		}
		return userDocuments || [];
	}, [
		userDocuments,
		searchResults,
		recentDocuments,
		hasActiveFilters,
		filters.isFavorite,
		currentView,
	]);

	// Event handlers
	const handleViewToggle = useCallback(() => {
		setViewMode((prev) => (prev === "grid" ? "list" : "grid"));
	}, []);

	const handleSearch = useCallback((query: string) => {
		setSearchQuery(query);
	}, []);

	const handleFiltersChange = useCallback(
		(newFilters: FilterCriteria) => {
			setFilters(newFilters);
			// Update selected folder if folder filter changes
			if (newFilters.folderId !== filters.folderId) {
				setSelectedFolderId(newFilters.folderId);
			}
		},
		[filters.folderId],
	);

	const handleFolderSelect = useCallback((folderId?: Id<"folders">) => {
		setSelectedFolderId(folderId);
		// Update filters to include the selected folder
		setFilters((prev) => ({ ...prev, folderId }));
	}, []);

	const handleAdvancedSearch = useCallback((criteria: SearchCriteria) => {
		// Update search query
		if (criteria.query !== undefined) {
			setSearchQuery(criteria.query || "");
		}

		// Update filters with advanced search criteria
		setFilters({
			folderId: criteria.folderId,
			status: criteria.status,
			tags: criteria.tags,
			dateRange: criteria.dateRange,
		});

		// Update selected folder if specified
		if (criteria.folderId !== undefined) {
			setSelectedFolderId(criteria.folderId);
		}
	}, []);

	// Handle saved search selection (same as advanced search)
	const handleSavedSearchSelect = useCallback(
		(criteria: SearchCriteria) => {
			handleAdvancedSearch(criteria);
		},
		[handleAdvancedSearch],
	);

	// Get current search criteria for saved searches
	const currentSearchCriteria: SearchCriteria = React.useMemo(
		() => ({
			query: searchQuery || undefined,
			folderId: filters.folderId,
			status: filters.status,
			tags: filters.tags,
			dateRange: filters.dateRange,
		}),
		[searchQuery, filters],
	);

	// Drag and drop handlers
	const handleDocumentMove = useCallback(
		(documentId: Id<"documents">, folderId?: Id<"folders">) => {
			// Refresh the document list after move
			// The mutation in DragDropProvider will handle the actual move
			console.log(
				`Document ${documentId} moved to folder ${folderId || "root"}`,
			);
		},
		[],
	);

	const handleFolderMove = useCallback(
		(folderId: Id<"folders">, parentId?: Id<"folders">) => {
			// Refresh the folder tree after move
			console.log(`Folder ${folderId} moved to parent ${parentId || "root"}`);
		},
		[],
	);

	const handleSidebarToggle = useCallback(() => {
		setSidebarCollapsed((prev) => !prev);
	}, []);

	const handleDocumentSelect = useCallback(
		(documentId: Id<"documents">, selected: boolean) => {
			setSelectedDocuments((prev) => {
				const newSet = new Set(prev);
				if (selected) {
					newSet.add(documentId);
				} else {
					newSet.delete(documentId);
				}
				return newSet;
			});
		},
		[],
	);

	const handleCreateDocument = useCallback(() => {
		// Always open the template modal instead of directly creating a document
		setCreateModalOpen(true);
	}, []);

	const handleDocumentCreated = useCallback(
		(documentId: Id<"documents">) => {
			if (onDocumentOpen) {
				onDocumentOpen(documentId);
			}
		},
		[onDocumentOpen],
	);

	const handleViewChange = useCallback(
		(view: "all" | "favorites" | "recent" | "drafts" | "archived") => {
			setCurrentView(view);
			// Clear folder selection when changing views
			setSelectedFolderId(undefined);
			// Update filters based on view
			switch (view) {
				case "favorites":
					setFilters({ isFavorite: true });
					break;
				case "recent":
					// Will be handled by sorting recent documents
					setFilters({});
					break;
				case "drafts":
					setFilters({ status: "draft" });
					break;
				case "archived":
					setFilters({ status: "archived" });
					break;
				default:
					setFilters({});
					break;
			}
		},
		[],
	);

	const handleDocumentOpen = useCallback(
		async (documentId: Id<"documents">) => {
			// Track document access
			try {
				await updateLastAccessed({ documentId });
			} catch (error) {
				console.error("Failed to update last accessed time:", error);
			}

			if (onDocumentOpen) {
				onDocumentOpen(documentId);
			}
		},
		[onDocumentOpen, updateLastAccessed],
	);

	return (
		<DragDropProvider
			onDocumentMove={handleDocumentMove}
			onFolderMove={handleFolderMove}
		>
			<div
				className={cn(
					"h-screen flex flex-col bg-background overflow-hidden",
					className,
				)}
			>
				{/* Header */}
				<DashboardHeader
					searchQuery={searchQuery}
					onSearch={handleSearch}
					onAdvancedSearch={handleAdvancedSearch}
					filters={filters}
					onFiltersChange={handleFiltersChange}
					viewMode={viewMode}
					onViewToggle={handleViewToggle}
					onCreateDocument={handleCreateDocument}
					onSidebarToggle={handleSidebarToggle}
					sidebarCollapsed={sidebarCollapsed}
					onSignOut={onSignOut}
				/>

				{/* Main Layout */}
				<div className="flex-1 flex overflow-hidden min-h-0">
					{/* Sidebar */}
					<DashboardSidebar
						collapsed={sidebarCollapsed}
						onToggle={handleSidebarToggle}
						selectedFolderId={selectedFolderId}
						onFolderSelect={handleFolderSelect}
						onSavedSearchSelect={handleSavedSearchSelect}
						currentSearchCriteria={currentSearchCriteria}
						onViewChange={handleViewChange}
						currentView={currentView}
						className="border-r"
					/>

					{/* Main Content */}
					<MainContent
						documents={filteredDocuments}
						viewMode={viewMode}
						selectedDocuments={selectedDocuments}
						onDocumentOpen={handleDocumentOpen}
						onDocumentSelect={handleDocumentSelect}
						onCreateDocument={handleCreateDocument}
						isLoading={
							hasActiveFilters
								? searchResults === undefined
								: userDocuments === undefined
						}
						className="flex-1"
					/>
				</div>
			</div>

			{/* Create Document Modal */}
			<CreateDocumentModal
				open={createModalOpen}
				onOpenChange={setCreateModalOpen}
				onDocumentCreated={handleDocumentCreated}
				defaultFolderId={selectedFolderId}
			/>
		</DragDropProvider>
	);
};
