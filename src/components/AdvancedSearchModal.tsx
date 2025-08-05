import { useQuery } from "convex/react";
import { Plus, Search, X } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

export interface SearchCriteria {
	query?: string;
	folderId?: Id<"folders">;
	status?: "draft" | "published" | "archived";
	tags?: string[];
	dateRange?: {
		start: number;
		end: number;
	};
	sortBy?: "title" | "updatedAt" | "createdAt" | "lastAccessedAt";
	sortOrder?: "asc" | "desc";
}

export interface AdvancedSearchModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSearch: (criteria: SearchCriteria) => void;
	initialCriteria?: SearchCriteria;
	trigger?: React.ReactNode;
}

interface DateRangePickerProps {
	value?: { start: number; end: number };
	onChange: (range?: { start: number; end: number }) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
	value,
	onChange,
}) => {
	const [startDate, setStartDate] = useState(
		value?.start ? new Date(value.start).toISOString().split("T")[0] : "",
	);
	const [endDate, setEndDate] = useState(
		value?.end ? new Date(value.end).toISOString().split("T")[0] : "",
	);

	const handleStartDateChange = useCallback(
		(date: string) => {
			// Optimistically update local state
			setStartDate(date);

			// If both dates are present, validate range before emitting change
			if (date && endDate) {
				const newStart = new Date(date).getTime();
				const currentEnd = new Date(endDate).getTime();

				// If invalid (start after end), prevent onChange and reset the invalid input
				if (
					!Number.isNaN(newStart) &&
					!Number.isNaN(currentEnd) &&
					newStart > currentEnd
				) {
					// Reset the invalid start date input to maintain a valid range
					setStartDate("");
					return;
				}

				onChange({
					start: newStart,
					end: currentEnd,
				});
			} else if (!date && !endDate) {
				// Both empty clears the range
				onChange(undefined);
			}
			// If only one side is set, we don't emit partial invalid ranges
		},
		[endDate, onChange],
	);

	const handleEndDateChange = useCallback(
		(date: string) => {
			// Optimistically update local state
			setEndDate(date);

			// If both dates are present, validate range before emitting change
			if (startDate && date) {
				const currentStart = new Date(startDate).getTime();
				const newEnd = new Date(date).getTime();

				// If invalid (end before start), prevent onChange and reset the invalid input
				if (
					!Number.isNaN(currentStart) &&
					!Number.isNaN(newEnd) &&
					newEnd < currentStart
				) {
					// Reset the invalid end date input to maintain a valid range
					setEndDate("");
					return;
				}

				onChange({
					start: currentStart,
					end: newEnd,
				});
			} else if (!startDate && !date) {
				// Both empty clears the range
				onChange(undefined);
			}
			// If only one side is set, we don't emit partial invalid ranges
		},
		[startDate, onChange],
	);

	const handleClear = useCallback(() => {
		setStartDate("");
		setEndDate("");
		onChange(undefined);
	}, [onChange]);

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<div className="flex-1">
					<Label htmlFor="start-date" className="text-sm">
						From
					</Label>
					<Input
						id="start-date"
						type="date"
						value={startDate}
						onChange={(e) => handleStartDateChange(e.target.value)}
						className="mt-1"
					/>
				</div>
				<div className="flex-1">
					<Label htmlFor="end-date" className="text-sm">
						To
					</Label>
					<Input
						id="end-date"
						type="date"
						value={endDate}
						onChange={(e) => handleEndDateChange(e.target.value)}
						className="mt-1"
					/>
				</div>
			</div>
			{(startDate || endDate) && (
				<Button
					variant="ghost"
					size="sm"
					onClick={handleClear}
					className="text-muted-foreground"
				>
					Clear dates
				</Button>
			)}
		</div>
	);
};

export const AdvancedSearchModal: React.FC<AdvancedSearchModalProps> = ({
	isOpen,
	onOpenChange,
	onSearch,
	initialCriteria = {},
	trigger,
}) => {
	const [criteria, setCriteria] = useState<SearchCriteria>(initialCriteria);
	const [newTag, setNewTag] = useState("");

	// Fetch data for dropdowns
	const folders = useQuery(api.folders.getUserFolders);

	// Fetch unique available tags via dedicated backend query
	const availableTags = useQuery(api.documents.getAvailableTags) ?? [];

	const handleCriteriaChange = useCallback(
		<K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) => {
			setCriteria((prev) => ({ ...prev, [key]: value }));
		},
		[],
	);

	const handleAddTag = useCallback(
		(tag: string) => {
			if (tag && !criteria.tags?.includes(tag)) {
				const newTags = [...(criteria.tags || []), tag];
				handleCriteriaChange("tags", newTags);
			}
			setNewTag("");
		},
		[criteria.tags, handleCriteriaChange],
	);

	const handleRemoveTag = useCallback(
		(tagToRemove: string) => {
			const newTags = criteria.tags?.filter((tag) => tag !== tagToRemove);
			handleCriteriaChange("tags", newTags?.length ? newTags : undefined);
		},
		[criteria.tags, handleCriteriaChange],
	);

	const handleSearch = useCallback(() => {
		onSearch(criteria);
		onOpenChange(false);
	}, [criteria, onSearch, onOpenChange]);

	const handleReset = useCallback(() => {
		setCriteria({});
	}, []);

	const hasActiveCriteria = Object.keys(criteria).some((key) => {
		const value = criteria[key as keyof SearchCriteria];
		return (
			value !== undefined &&
			value !== "" &&
			(Array.isArray(value) ? value.length > 0 : true)
		);
	});

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			{trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Advanced Search</DialogTitle>
					<DialogDescription>
						Build complex search queries with multiple criteria
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 py-4">
					{/* Search Query */}
					<div className="space-y-2">
						<Label htmlFor="search-query">Search Text</Label>
						<Input
							id="search-query"
							placeholder="Enter search terms..."
							value={criteria.query || ""}
							onChange={(e) =>
								handleCriteriaChange("query", e.target.value || undefined)
							}
						/>
					</div>

					{/* Folder Filter */}
					<div className="space-y-2">
						<Label>Folder</Label>
						<Select
							value={(criteria.folderId as string | undefined) ?? "all"}
							onValueChange={(value: string) => {
								if (value === "all") {
									handleCriteriaChange("folderId", undefined);
									return;
								}
								// Narrow string to Id<"folders"> by validating against available folder ids
								const match = folders?.find((f) => f._id === value);
								if (match) {
									handleCriteriaChange("folderId", match._id);
								} else {
									// If value isn't a known id, clear selection to stay type-safe
									handleCriteriaChange("folderId", undefined);
								}
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select folder..." />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Folders</SelectItem>
								{folders?.map((folder) => (
									<SelectItem key={folder._id} value={folder._id}>
										{folder.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Status Filter */}
					<div className="space-y-2">
						<Label>Status</Label>
						<Select
							value={(criteria.status as string | undefined) ?? "all"}
							onValueChange={(
								value: "all" | "draft" | "published" | "archived",
							) => {
								handleCriteriaChange(
									"status",
									value === "all" ? undefined : value,
								);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select status..." />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Statuses</SelectItem>
								<SelectItem value="draft">Draft</SelectItem>
								<SelectItem value="published">Published</SelectItem>
								<SelectItem value="archived">Archived</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Tags */}
					<div className="space-y-2">
						<Label>Tags</Label>
						<div className="flex flex-wrap gap-1 mb-2">
							{criteria.tags?.map((tag: string) => (
								<div
									key={tag}
									className="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs"
								>
									<span>{tag}</span>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleRemoveTag(tag)}
										className="h-4 w-4 p-0 hover:bg-secondary-foreground/20"
									>
										<X className="h-2 w-2" />
									</Button>
								</div>
							))}
						</div>
						<div className="flex gap-2">
							<Input
								placeholder="Add tag..."
								value={newTag}
								onChange={(e) => setNewTag(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleAddTag(newTag);
									}
								}}
								className="flex-1"
							/>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="sm">
										<Plus className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									{availableTags
										.filter((tag: string) => !criteria.tags?.includes(tag))
										.map((tag: string) => (
											<DropdownMenuItem
												key={tag}
												onClick={() => handleAddTag(tag)}
											>
												{tag}
											</DropdownMenuItem>
										))}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>

					{/* Date Range */}
					<div className="space-y-2">
						<Label>Date Range</Label>
						<DateRangePicker
							value={criteria.dateRange}
							onChange={(range) => handleCriteriaChange("dateRange", range)}
						/>
					</div>

					{/* Sort Options */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Sort By</Label>
							<Select
								value={(criteria.sortBy as string | undefined) ?? "updatedAt"}
								onValueChange={(
									value: "title" | "updatedAt" | "createdAt" | "lastAccessedAt",
								) => handleCriteriaChange("sortBy", value)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="title">Title</SelectItem>
									<SelectItem value="updatedAt">Last Modified</SelectItem>
									<SelectItem value="createdAt">Created Date</SelectItem>
									<SelectItem value="lastAccessedAt">Last Accessed</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Sort Order</Label>
							<Select
								value={(criteria.sortOrder as string | undefined) ?? "desc"}
								onValueChange={(value: "asc" | "desc") =>
									handleCriteriaChange("sortOrder", value)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="desc">Newest First</SelectItem>
									<SelectItem value="asc">Oldest First</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="flex justify-between pt-4 border-t">
					<Button
						variant="ghost"
						onClick={handleReset}
						disabled={!hasActiveCriteria}
					>
						Reset All
					</Button>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleSearch}>
							<Search className="h-4 w-4 mr-2" />
							Search
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
