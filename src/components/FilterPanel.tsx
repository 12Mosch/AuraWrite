import { useQuery } from "convex/react";
import { Calendar, Filter, Folder, Star, Tag, X } from "lucide-react";
import React, { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export interface FilterCriteria {
	folderId?: Id<"folders">;
	status?: "draft" | "published" | "archived";
	tags?: string[];
	dateRange?: {
		start: number;
		end: number;
	};
	isFavorite?: boolean;
}

export interface FilterPanelProps {
	filters: FilterCriteria;
	onFiltersChange: (filters: FilterCriteria) => void;
	className?: string;
	showAsDropdown?: boolean;
}

interface FilterChipProps {
	label: string;
	onRemove: () => void;
	icon?: React.ReactNode;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, onRemove, icon }) => {
	return (
		<div className="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs">
			{icon && <span className="h-3 w-3">{icon}</span>}
			<span>{label}</span>
			<Button
				variant="ghost"
				size="sm"
				onClick={onRemove}
				className="h-4 w-4 p-0 hover:bg-secondary-foreground/20"
			>
				<X className="h-2 w-2" />
			</Button>
		</div>
	);
};

export const FilterPanel: React.FC<FilterPanelProps> = ({
	filters,
	onFiltersChange,
	className,
	showAsDropdown = false,
}) => {
	const [isOpen, setIsOpen] = useState(false);

	// Fetch data for filter options
	const folders = useQuery(api.folders.getUserFolders);

	// Get active filter count
	const activeFilterCount = React.useMemo(() => {
		let count = 0;
		if (filters.folderId) count++;
		if (filters.status) count++;
		if (filters.tags && filters.tags.length > 0) count++;
		if (filters.dateRange) count++;
		if (filters.isFavorite) count++;
		return count;
	}, [filters]);

	// Handle filter changes
	const handleFolderChange = useCallback(
		(folderId?: Id<"folders">) => {
			onFiltersChange({ ...filters, folderId });
		},
		[filters, onFiltersChange],
	);

	const handleStatusChange = useCallback(
		(status?: "draft" | "published" | "archived") => {
			onFiltersChange({ ...filters, status });
		},
		[filters, onFiltersChange],
	);

	const handleTagToggle = useCallback(
		(tag: string) => {
			const currentTags = filters.tags || [];
			const newTags = currentTags.includes(tag)
				? currentTags.filter((t) => t !== tag)
				: [...currentTags, tag];
			onFiltersChange({
				...filters,
				tags: newTags.length > 0 ? newTags : undefined,
			});
		},
		[filters, onFiltersChange],
	);

	const handleFavoriteToggle = useCallback(() => {
		onFiltersChange({ ...filters, isFavorite: !filters.isFavorite });
	}, [filters, onFiltersChange]);

	const handleDateRangeChange = useCallback(
		(dateRange?: { start: number; end: number }) => {
			onFiltersChange({ ...filters, dateRange });
		},
		[filters, onFiltersChange],
	);

	const handleClearAll = useCallback(() => {
		onFiltersChange({});
	}, [onFiltersChange]);

	// Get folder name by ID
	const getFolderName = useCallback(
		(folderId: Id<"folders">) => {
			return folders?.find((f) => f._id === folderId)?.name || "Unknown Folder";
		},
		[folders],
	);

	// Common filter options
	const statusOptions = [
		{ value: "draft", label: "Draft" },
		{ value: "published", label: "Published" },
		{ value: "archived", label: "Archived" },
	] as const;

	// Sample tags (in a real app, you'd fetch these from documents)
	const availableTags = ["work", "personal", "urgent", "meeting", "project"];

	// Render active filter chips
	const renderFilterChips = () => {
		const chips: React.ReactNode[] = [];

		if (filters.folderId) {
			chips.push(
				<FilterChip
					key="folder"
					label={getFolderName(filters.folderId)}
					icon={<Folder className="h-3 w-3" />}
					onRemove={() => handleFolderChange(undefined)}
				/>,
			);
		}

		if (filters.status) {
			chips.push(
				<FilterChip
					key="status"
					label={
						statusOptions.find((s) => s.value === filters.status)?.label ||
						filters.status
					}
					onRemove={() => handleStatusChange(undefined)}
				/>,
			);
		}

		if (filters.tags && filters.tags.length > 0) {
			filters.tags.forEach((tag) => {
				chips.push(
					<FilterChip
						key={`tag-${tag}`}
						label={tag}
						icon={<Tag className="h-3 w-3" />}
						onRemove={() => handleTagToggle(tag)}
					/>,
				);
			});
		}

		if (filters.isFavorite) {
			chips.push(
				<FilterChip
					key="favorite"
					label="Favorites"
					icon={<Star className="h-3 w-3" />}
					onRemove={() => handleFavoriteToggle()}
				/>,
			);
		}

		if (filters.dateRange) {
			chips.push(
				<FilterChip
					key="date"
					label="Date Range"
					icon={<Calendar className="h-3 w-3" />}
					onRemove={() => handleDateRangeChange(undefined)}
				/>,
			);
		}

		return chips;
	};

	const filterContent = (
		<div className="space-y-4 p-4">
			{/* Folder Filter */}
			<div>
				<label
					htmlFor="folder-filter"
					className="text-sm font-medium mb-2 block"
				>
					Folder
				</label>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							id="folder-filter"
							variant="outline"
							className="w-full justify-start"
						>
							<Folder className="h-4 w-4 mr-2" />
							{filters.folderId
								? getFolderName(filters.folderId)
								: "All Folders"}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56">
						<DropdownMenuItem onClick={() => handleFolderChange(undefined)}>
							All Folders
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{folders?.map((folder) => (
							<DropdownMenuItem
								key={folder._id}
								onClick={() => handleFolderChange(folder._id)}
							>
								<Folder className="h-4 w-4 mr-2" />
								{folder.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Status Filter */}
			<div>
				<label
					htmlFor="status-filter"
					className="text-sm font-medium mb-2 block"
				>
					Status
				</label>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							id="status-filter"
							variant="outline"
							className="w-full justify-start"
						>
							{filters.status
								? statusOptions.find((s) => s.value === filters.status)?.label
								: "All Statuses"}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56">
						<DropdownMenuItem onClick={() => handleStatusChange(undefined)}>
							All Statuses
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{statusOptions.map((option) => (
							<DropdownMenuItem
								key={option.value}
								onClick={() => handleStatusChange(option.value)}
							>
								{option.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Tags Filter */}
			<fieldset>
				<legend className="text-sm font-medium mb-2 block">Tags</legend>
				<div className="flex flex-wrap gap-1">
					{availableTags.map((tag) => (
						<Button
							key={tag}
							variant={filters.tags?.includes(tag) ? "default" : "outline"}
							size="sm"
							onClick={() => handleTagToggle(tag)}
							className="text-xs"
						>
							<Tag className="h-3 w-3 mr-1" />
							{tag}
						</Button>
					))}
				</div>
			</fieldset>

			{/* Favorites Filter */}
			<div>
				<Button
					variant={filters.isFavorite ? "default" : "outline"}
					onClick={handleFavoriteToggle}
					className="w-full justify-start"
				>
					<Star className="h-4 w-4 mr-2" />
					Show Favorites Only
				</Button>
			</div>

			{/* Clear All */}
			{activeFilterCount > 0 && (
				<Button
					variant="ghost"
					onClick={handleClearAll}
					className="w-full text-muted-foreground"
				>
					Clear All Filters
				</Button>
			)}
		</div>
	);

	if (showAsDropdown) {
		return (
			<div className={cn("relative", className)}>
				<Popover open={isOpen} onOpenChange={setIsOpen}>
					<PopoverTrigger asChild>
						<Button variant="outline" className="relative">
							<Filter className="h-4 w-4 mr-2" />
							Filters
							{activeFilterCount > 0 && (
								<span className="absolute -top-1 -right-1 h-5 w-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
									{activeFilterCount}
								</span>
							)}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-0" align="start">
						{filterContent}
					</PopoverContent>
				</Popover>

				{/* Active Filter Chips */}
				{activeFilterCount > 0 && (
					<div className="flex flex-wrap gap-1 mt-2">{renderFilterChips()}</div>
				)}
			</div>
		);
	}

	return (
		<div className={cn("space-y-4", className)}>
			{filterContent}

			{/* Active Filter Chips */}
			{activeFilterCount > 0 && (
				<div className="flex flex-wrap gap-1 pt-2 border-t">
					{renderFilterChips()}
				</div>
			)}
		</div>
	);
};
