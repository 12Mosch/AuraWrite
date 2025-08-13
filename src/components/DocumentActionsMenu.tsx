import { useMutation, useQuery } from "convex/react";
import {
	Archive,
	Copy,
	FolderOpen,
	Heart,
	MoreHorizontal,
	Pencil,
	Share2,
	Star,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export interface DocumentActionsMenuProps {
	documentId: Id<"documents">;
	documentTitle: string;
	isFavorite?: boolean;
	status?: "draft" | "published" | "archived";
	onEdit?: () => void;
	onShare?: () => void;
	onMove?: (folderId?: Id<"folders">) => void;
	className?: string;
	trigger?: React.ReactNode;
}

export const DocumentActionsMenu: React.FC<DocumentActionsMenuProps> = ({
	documentId,
	documentTitle,
	isFavorite = false,
	status = "draft",
	onEdit,
	onShare,
	onMove,
	className,
	trigger,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Mutations
	const duplicateDocument = useMutation(api.documents.duplicateDocument);
	const toggleFavorite = useMutation(api.documents.toggleDocumentFavorite);
	const updateStatus = useMutation(api.documents.updateDocumentStatus);
	const archiveDocument = useMutation(api.documents.archiveDocuments);
	const deleteDocument = useMutation(api.documents.deleteDocument);

	// Handle duplicate
	const handleDuplicate = useCallback(async () => {
		try {
			await duplicateDocument({
				documentId,
				title: `Copy of ${documentTitle}`,
			});
			toast.success("Document duplicated", {
				description: `"${documentTitle}" has been duplicated successfully.`,
			});
			setIsOpen(false);
		} catch (error) {
			console.error("Failed to duplicate document:", error);
			toast.error("Failed to duplicate document", {
				description: "Please try again later.",
			});
		}
	}, [duplicateDocument, documentId, documentTitle]);

	// Handle favorite toggle
	const handleToggleFavorite = useCallback(async () => {
		try {
			await toggleFavorite({ documentId });
			// Provide user feedback consistent with other actions
			if (isFavorite) {
				toast.success("Removed from favorites", {
					description: `"${documentTitle}" has been removed from your favorites.`,
				});
			} else {
				toast.success("Added to favorites", {
					description: `"${documentTitle}" has been added to your favorites.`,
				});
			}
			setIsOpen(false);
		} catch (error) {
			console.error("Failed to toggle favorite:", error);
			toast.error("Failed to update favorites", {
				description: "Please try again later.",
			});
		}
	}, [toggleFavorite, documentId, isFavorite, documentTitle]);

	// Handle status change
	const handleStatusChange = useCallback(
		async (newStatus: "draft" | "published" | "archived") => {
			try {
				await updateStatus({ documentId, status: newStatus });
				// Provide user feedback similar to favorite toggle
				const label =
					newStatus === "draft"
						? "Draft"
						: newStatus === "published"
							? "Published"
							: "Archived";
				toast.success("Status updated", {
					description: `"${documentTitle}" status changed to ${label}.`,
				});
				setIsOpen(false);
			} catch (error) {
				console.error("Failed to update status:", error);
				toast.error("Failed to update status", {
					description: "Please try again later.",
				});
			}
		},
		[updateStatus, documentId, documentTitle],
	);

	// Handle archive
	const handleArchive = useCallback(async () => {
		try {
			await archiveDocument({ documentIds: [documentId] });
			toast.success("Document archived", {
				description: `"${documentTitle}" has been moved to archive. You can restore it later.`,
			});
			setIsOpen(false);
		} catch (error) {
			console.error("Failed to archive document:", error);
			toast.error("Failed to archive document", {
				description: "Please try again later.",
			});
		}
	}, [archiveDocument, documentId, documentTitle]);

	// Delete flow with ConfirmDialog
	const confirmDelete = useCallback(async () => {
		setDeleting(true);
		try {
			await deleteDocument({ documentId });
			toast.success("Document deleted", {
				description: `"${documentTitle}" has been permanently deleted.`,
			});
			setConfirmDeleteOpen(false);
			setIsOpen(false);
		} catch (error) {
			console.error("Failed to delete document:", error);
			toast.error("Failed to delete document", {
				description: "Please try again later.",
			});
		} finally {
			setDeleting(false);
		}
	}, [deleteDocument, documentId, documentTitle]);

	// Handle edit
	const handleEdit = useCallback(() => {
		onEdit?.();
		setIsOpen(false);
	}, [onEdit]);

	// Handle share
	const handleShare = useCallback(() => {
		onShare?.();
		setIsOpen(false);
	}, [onShare]);

	// Fetch folder tree once at top-level to satisfy Hooks rules
	const folderTree = useQuery(api.folders.getFolderTree);

	// Types to avoid explicit any
	type FolderWithChildren = {
		_id: Id<"folders">;
		name: string;
		color?: string;
		parentId?: Id<"folders">;
		ownerId: Id<"users">;
		createdAt: number;
		updatedAt: number;
		_creationTime: number;
		children: FolderWithChildren[];
	};

	// Flatten folder tree for menu rendering with indentation
	const flattenedFolders = useMemo(() => {
		if (!folderTree) return folderTree; // undefined => loading, null => error
		const items: Array<{
			id: Id<"folders">;
			name: string;
			depth: number;
			color?: string;
		}> = [];
		const walk = (nodes: FolderWithChildren[], depth = 0) => {
			for (const n of nodes) {
				items.push({
					id: n._id,
					name: n.name,
					depth,
					color: n.color || undefined,
				});
				if (n.children?.length) walk(n.children, depth + 1);
			}
		};
		walk(folderTree as unknown as FolderWithChildren[]);
		return items;
	}, [folderTree]);

	const defaultTrigger = (
		<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
			<MoreHorizontal className="h-4 w-4" />
			<span className="sr-only">Open menu</span>
		</Button>
	);

	return (
		<>
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild className={className}>
					{trigger || defaultTrigger}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					{/* Edit */}
					<DropdownMenuItem onClick={handleEdit}>
						<Pencil className="h-4 w-4 mr-2" />
						Edit
					</DropdownMenuItem>

					{/* Share */}
					<DropdownMenuItem onClick={handleShare}>
						<Share2 className="h-4 w-4 mr-2" />
						Share
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					{/* Duplicate */}
					<DropdownMenuItem onClick={handleDuplicate}>
						<Copy className="h-4 w-4 mr-2" />
						Duplicate
					</DropdownMenuItem>

					{/* Favorite */}
					<DropdownMenuItem onClick={handleToggleFavorite}>
						{isFavorite ? (
							<>
								<Heart className="h-4 w-4 mr-2 fill-current text-red-500" />
								Remove from favorites
							</>
						) : (
							<>
								<Star className="h-4 w-4 mr-2" />
								Add to favorites
							</>
						)}
					</DropdownMenuItem>

					{/* Move to folder */}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<FolderOpen className="h-4 w-4 mr-2" />
							Move to folder
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem onClick={() => onMove?.(undefined)}>
								<FolderOpen className="h-4 w-4 mr-2" />
								Root folder
							</DropdownMenuItem>

							{folderTree === undefined && (
								<DropdownMenuItem disabled>
									<span className="h-4 w-4 mr-2" />
									Loading folders...
								</DropdownMenuItem>
							)}

							{folderTree === null && (
								<DropdownMenuItem disabled>
									<span className="h-4 w-4 mr-2" />
									Failed to load folders
								</DropdownMenuItem>
							)}

							{Array.isArray(flattenedFolders) &&
								flattenedFolders.length === 0 && (
									<DropdownMenuItem disabled>
										<span className="h-4 w-4 mr-2" />
										No folders yet
									</DropdownMenuItem>
								)}

							{Array.isArray(flattenedFolders) &&
								flattenedFolders.length > 0 &&
								flattenedFolders.map((f) => (
									<DropdownMenuItem
										key={f.id as unknown as string}
										onSelect={() => onMove?.(f.id)}
									>
										<FolderOpen
											className="h-4 w-4 mr-2"
											style={{ color: f.color || undefined }}
										/>
										<span>
											{f.depth > 0 ? `${"".padStart(f.depth * 2, " ")}• ` : ""}
											{f.name}
										</span>
									</DropdownMenuItem>
								))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSeparator />

					{/* Status submenu */}
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<div className="flex items-center">
								<div
									className={`h-2 w-2 rounded-full mr-2 ${
										status === "draft"
											? "bg-yellow-500"
											: status === "published"
												? "bg-green-500"
												: "bg-gray-500"
									}`}
								/>
								Change status
							</div>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								onClick={() => handleStatusChange("draft")}
								disabled={status === "draft"}
							>
								<div className="h-2 w-2 rounded-full bg-yellow-500 mr-2" />
								Draft
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleStatusChange("published")}
								disabled={status === "published"}
							>
								<div className="h-2 w-2 rounded-full bg-green-500 mr-2" />
								Published
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleStatusChange("archived")}
								disabled={status === "archived"}
							>
								<div className="h-2 w-2 rounded-full bg-gray-500 mr-2" />
								Archived
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSeparator />

					{/* Archive */}
					{status !== "archived" && (
						<DropdownMenuItem onClick={handleArchive}>
							<Archive className="h-4 w-4 mr-2" />
							Archive
						</DropdownMenuItem>
					)}

					{/* Delete */}
					<DropdownMenuItem
						onClick={() => setConfirmDeleteOpen(true)}
						className="text-red-600"
					>
						<Trash2 className="h-4 w-4 mr-2" />
						Delete permanently
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={confirmDeleteOpen}
				onOpenChange={(o) => {
					if (!o) setConfirmDeleteOpen(false);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete document</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to permanently delete "{documentTitle}"?
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel asChild>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setConfirmDeleteOpen(false)}
								disabled={deleting}
							>
								Cancel
							</Button>
						</AlertDialogCancel>
						<AlertDialogAction asChild>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleting}
							>
								Delete
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
