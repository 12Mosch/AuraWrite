import { useMutation, useQuery } from "convex/react";
import { Bookmark, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { SearchCriteria } from "./AdvancedSearchModal";
import { Button } from "./ui/button";

// Type definition for saved search object
interface SavedSearch {
	_id: Id<"savedSearches">;
	name: string;
	query?: string;
	filters: {
		folderId?: Id<"folders">;
		status?: "draft" | "published" | "archived";
		tags?: string[];
		dateRange?: {
			start: number;
			end: number;
		};
	};
	sortBy?: "title" | "updatedAt" | "createdAt" | "lastAccessedAt";
	sortOrder?: "asc" | "desc";
	userId: Id<"users">;
	createdAt: number;
	updatedAt: number;
	_creationTime: number;
}

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export interface SavedSearchesProps {
	onSearchSelect?: (criteria: SearchCriteria) => void;
	onSaveCurrentSearch?: (name: string) => void;
	currentSearchCriteria?: SearchCriteria;
	className?: string;
}

interface SaveSearchDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (name: string) => void;
	initialName?: string;
}

const SaveSearchDialog: React.FC<SaveSearchDialogProps> = ({
	isOpen,
	onOpenChange,
	onSave,
	initialName = "",
}) => {
	const [name, setName] = useState(initialName);

	const handleSave = useCallback(() => {
		if (name.trim()) {
			onSave(name.trim());
			setName("");
			onOpenChange(false);
		}
	}, [name, onSave, onOpenChange]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleSave();
			}
		},
		[handleSave],
	);

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Save Search</DialogTitle>
					<DialogDescription>
						Give your search a name to save it for later use.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="search-name">Search Name</Label>
						<Input
							id="search-name"
							placeholder="Enter search name..."
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={handleKeyDown}
							autoFocus
						/>
					</div>
				</div>

				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!name.trim()}>
						Save Search
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export const SavedSearches: React.FC<SavedSearchesProps> = ({
	onSearchSelect,
	onSaveCurrentSearch,
	currentSearchCriteria,
	className,
}) => {
	const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

	// Fetch saved searches
	const savedSearches = useQuery(api.savedSearches.getUserSavedSearches);

	// Mutations
	const createSavedSearch = useMutation(api.savedSearches.createSavedSearch);
	const deleteSavedSearch = useMutation(api.savedSearches.deleteSavedSearch);

	// Handle save current search
	const handleSaveCurrentSearch = useCallback(
		async (name: string) => {
			if (!currentSearchCriteria) return;

			try {
				await createSavedSearch({
					name,
					query: currentSearchCriteria.query,
					filters: {
						folderId: currentSearchCriteria.folderId,
						status: currentSearchCriteria.status,
						tags: currentSearchCriteria.tags,
						dateRange: currentSearchCriteria.dateRange,
					},
					sortBy: currentSearchCriteria.sortBy,
					sortOrder: currentSearchCriteria.sortOrder,
				});
				onSaveCurrentSearch?.(name);
			} catch (error) {
				console.error("Failed to save search:", error);
			}
		},
		[currentSearchCriteria, createSavedSearch, onSaveCurrentSearch],
	);

	// Handle search selection
	const handleSearchSelect = useCallback(
		(savedSearch: SavedSearch) => {
			const criteria: SearchCriteria = {
				query: savedSearch.query,
				folderId: savedSearch.filters.folderId,
				status: savedSearch.filters.status,
				tags: savedSearch.filters.tags,
				dateRange: savedSearch.filters.dateRange,
				sortBy: savedSearch.sortBy,
				sortOrder: savedSearch.sortOrder,
			};
			onSearchSelect?.(criteria);
		},
		[onSearchSelect],
	);

	// Handle delete search
	const handleDeleteSearch = useCallback(
		async (searchId: Id<"savedSearches">) => {
			try {
				await deleteSavedSearch({ savedSearchId: searchId });
			} catch (error) {
				console.warn("Failed to delete saved search:", error);
			}
		},
		[deleteSavedSearch],
	);

	// Check if current search can be saved
	const canSaveCurrentSearch =
		currentSearchCriteria &&
		(currentSearchCriteria.query ||
			currentSearchCriteria.folderId ||
			currentSearchCriteria.status ||
			(currentSearchCriteria.tags && currentSearchCriteria.tags.length > 0) ||
			currentSearchCriteria.dateRange);

	// Format search description
	const formatSearchDescription = useCallback((savedSearch: SavedSearch) => {
		const parts: string[] = [];

		if (savedSearch.query) {
			parts.push(`"${savedSearch.query}"`);
		}

		if (savedSearch.filters.status) {
			parts.push(`Status: ${savedSearch.filters.status}`);
		}

		if (savedSearch.filters.tags && savedSearch.filters.tags.length > 0) {
			parts.push(`Tags: ${savedSearch.filters.tags.join(", ")}`);
		}

		if (savedSearch.filters.dateRange) {
			parts.push("Date range");
		}

		return parts.length > 0 ? parts.join(" • ") : "All documents";
	}, []);

	return (
		<div className={cn("space-y-2", className)}>
			{/* Header */}
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium text-muted-foreground">
					Saved Searches
				</h3>
				{canSaveCurrentSearch && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsSaveDialogOpen(true)}
						className="h-6 px-2 text-xs"
					>
						<Plus className="h-3 w-3 mr-1" />
						Save Current
					</Button>
				)}
			</div>

			{/* Saved Searches List */}
			<div className="space-y-1">
				{savedSearches?.map((savedSearch) => (
					<div
						key={savedSearch._id}
						className="group flex items-center gap-2 p-2 rounded-md hover:bg-accent hover:text-accent-foreground"
					>
						<Bookmark className="h-4 w-4 text-muted-foreground flex-shrink-0" />
						<Button
							variant="ghost"
							className="flex-1 min-w-0 justify-start p-0 h-auto font-normal"
							onClick={() => handleSearchSelect(savedSearch)}
						>
							<div className="text-left w-full">
								<div className="text-sm font-medium truncate">
									{savedSearch.name}
								</div>
								<div className="text-xs text-muted-foreground truncate">
									{formatSearchDescription(savedSearch)}
								</div>
							</div>
						</Button>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
								>
									<MoreHorizontal className="h-3 w-3" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onClick={() => handleSearchSelect(savedSearch)}
								>
									<Search className="h-4 w-4 mr-2" />
									Apply Search
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => handleDeleteSearch(savedSearch._id)}
									className="text-destructive"
								>
									<Trash2 className="h-4 w-4 mr-2" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				))}

				{/* Empty State */}
				{savedSearches?.length === 0 && (
					<div className="text-center py-6 text-muted-foreground">
						<Bookmark className="h-8 w-8 mx-auto mb-2 opacity-50" />
						<p className="text-sm">No saved searches yet</p>
						{canSaveCurrentSearch && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setIsSaveDialogOpen(true)}
								className="mt-2"
							>
								Save your first search
							</Button>
						)}
					</div>
				)}
			</div>

			{/* Save Search Dialog */}
			<SaveSearchDialog
				isOpen={isSaveDialogOpen}
				onOpenChange={setIsSaveDialogOpen}
				onSave={handleSaveCurrentSearch}
			/>
		</div>
	);
};
