import {
	ChevronDown,
	ChevronUp,
	Copy,
	FileText,
	Globe,
	Lock,
	MoreHorizontal,
	Share2,
	Star,
	Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";
import type { Document } from "./MainContent";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export interface DocumentListProps {
	documents: Document[];
	selectedDocuments: Set<Id<"documents">>;
	onDocumentOpen: (documentId: Id<"documents">) => void;
	onDocumentSelect: (documentId: Id<"documents">, selected: boolean) => void;
	className?: string;
}

type SortField = "title" | "updatedAt" | "createdAt" | "status";
type SortOrder = "asc" | "desc";

const formatDate = (timestamp: number): string => {
	const date = new Date(timestamp);
	return date.toLocaleDateString([], {
		month: "short",
		day: "numeric",
		year:
			date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
	});
};

const formatTime = (timestamp: number): string => {
	const date = new Date(timestamp);
	const now = new Date();
	const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

	if (diffInHours < 24) {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	} else if (diffInHours < 24 * 7) {
		return date.toLocaleDateString([], { weekday: "short" });
	} else {
		return formatDate(timestamp);
	}
};

export const DocumentList: React.FC<DocumentListProps> = ({
	documents,
	selectedDocuments,
	onDocumentOpen,
	onDocumentSelect,
	className,
}) => {
	const [sortField, setSortField] = useState<SortField>("updatedAt");
	const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortOrder(sortOrder === "asc" ? "desc" : "asc");
		} else {
			setSortField(field);
			setSortOrder("desc");
		}
	};

	const sortedDocuments = React.useMemo(() => {
		return [...documents].sort((a, b) => {
			let aValue: string | number;
			let bValue: string | number;

			switch (sortField) {
				case "title":
					aValue = a.title.toLowerCase();
					bValue = b.title.toLowerCase();
					break;
				case "updatedAt":
					aValue = a.updatedAt;
					bValue = b.updatedAt;
					break;
				case "createdAt":
					aValue = a.createdAt;
					bValue = b.createdAt;
					break;
				case "status":
					aValue = a.status || "draft";
					bValue = b.status || "draft";
					break;
				default:
					return 0;
			}

			if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
			if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
			return 0;
		});
	}, [documents, sortField, sortOrder]);

	const SortButton: React.FC<{
		field: SortField;
		children: React.ReactNode;
	}> = ({ field, children }) => (
		<Button
			variant="ghost"
			size="sm"
			onClick={() => handleSort(field)}
			className="h-8 px-2 justify-start font-medium text-xs"
		>
			{children}
			{sortField === field &&
				(sortOrder === "asc" ? (
					<ChevronUp className="ml-1 h-3 w-3" />
				) : (
					<ChevronDown className="ml-1 h-3 w-3" />
				))}
		</Button>
	);

	if (documents.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted-foreground">
				<p>No documents found</p>
			</div>
		);
	}

	return (
		<div className={cn("border rounded-lg overflow-hidden", className)}>
			{/* Table Header */}
			<div className="bg-muted/50 border-b px-4 py-2">
				<div className="grid grid-cols-12 gap-4 items-center">
					<div className="col-span-1">
						{/* Select All Checkbox */}
						<Button
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0"
							onClick={() => {
								const allSelected = documents.every((doc) =>
									selectedDocuments.has(doc._id),
								);
								documents.forEach((doc) => {
									onDocumentSelect(doc._id, !allSelected);
								});
							}}
						>
							<div
								className={cn(
									"h-4 w-4 border-2 rounded",
									documents.every((doc) => selectedDocuments.has(doc._id))
										? "bg-primary border-primary"
										: "border-muted-foreground",
								)}
							>
								{documents.every((doc) => selectedDocuments.has(doc._id)) && (
									<div className="h-full w-full flex items-center justify-center">
										<div className="h-2 w-2 bg-primary-foreground rounded-sm" />
									</div>
								)}
							</div>
						</Button>
					</div>
					<div className="col-span-5">
						<SortButton field="title">Name</SortButton>
					</div>
					<div className="col-span-2">
						<SortButton field="status">Status</SortButton>
					</div>
					<div className="col-span-2">
						<SortButton field="updatedAt">Modified</SortButton>
					</div>
					<div className="col-span-2">{/* Actions header */}</div>
				</div>
			</div>

			{/* Table Body */}
			<div className="divide-y">
				{sortedDocuments.map((document) => (
					<button
						key={document._id}
						type="button"
						className={cn(
							"grid grid-cols-12 gap-4 items-center px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors w-full text-left",
							selectedDocuments.has(document._id) && "bg-primary/5",
						)}
						onClick={() => onDocumentOpen(document._id)}
						aria-label={`Open document ${document.title}`}
					>
						{/* Selection */}
						<div className="col-span-1">
							<Button
								variant="ghost"
								size="sm"
								className="h-6 w-6 p-0"
								onClick={(e) => {
									e.stopPropagation();
									onDocumentSelect(
										document._id,
										!selectedDocuments.has(document._id),
									);
								}}
							>
								<div
									className={cn(
										"h-4 w-4 border-2 rounded",
										selectedDocuments.has(document._id)
											? "bg-primary border-primary"
											: "border-muted-foreground",
									)}
								>
									{selectedDocuments.has(document._id) && (
										<div className="h-full w-full flex items-center justify-center">
											<div className="h-2 w-2 bg-primary-foreground rounded-sm" />
										</div>
									)}
								</div>
							</Button>
						</div>

						{/* Name */}
						<div className="col-span-5 flex items-center gap-3 min-w-0">
							<FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
							<div className="min-w-0 flex-1">
								<p className="font-medium text-sm truncate">{document.title}</p>
								<div className="flex items-center gap-2 mt-0.5">
									{document.isPublic ? (
										<Globe className="h-3 w-3 text-muted-foreground" />
									) : (
										<Lock className="h-3 w-3 text-muted-foreground" />
									)}
									{document.isFavorite && (
										<Star className="h-3 w-3 text-yellow-500 fill-current" />
									)}
								</div>
							</div>
						</div>

						{/* Status */}
						<div className="col-span-2">
							{document.status && (
								<Badge variant="secondary" className="text-xs">
									{document.status}
								</Badge>
							)}
						</div>

						{/* Modified */}
						<div className="col-span-2">
							<span className="text-sm text-muted-foreground">
								{formatTime(document.updatedAt)}
							</span>
						</div>

						{/* Actions */}
						<div className="col-span-2 flex justify-end">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-8 w-8 p-0"
										onClick={(e) => e.stopPropagation()}
									>
										<MoreHorizontal className="h-4 w-4" />
										<span className="sr-only">More actions</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-48">
									<DropdownMenuItem
										onClick={() => onDocumentOpen(document._id)}
									>
										<FileText className="h-4 w-4 mr-2" />
										Open
									</DropdownMenuItem>
									<DropdownMenuItem>
										<Star className="h-4 w-4 mr-2" />
										{document.isFavorite
											? "Remove from favorites"
											: "Add to favorites"}
									</DropdownMenuItem>
									<DropdownMenuItem>
										<Share2 className="h-4 w-4 mr-2" />
										Share
									</DropdownMenuItem>
									<DropdownMenuItem>
										<Copy className="h-4 w-4 mr-2" />
										Duplicate
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem className="text-destructive">
										<Trash2 className="h-4 w-4 mr-2" />
										Delete
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</button>
				))}
			</div>
		</div>
	);
};
