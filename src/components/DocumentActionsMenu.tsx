import { useMutation } from "convex/react";
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
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
			setIsOpen(false);
		} catch (error) {
			console.error("Failed to toggle favorite:", error);
		}
	}, [toggleFavorite, documentId]);

	// Handle status change
	const handleStatusChange = useCallback(
		async (newStatus: "draft" | "published" | "archived") => {
			try {
				await updateStatus({ documentId, status: newStatus });
				setIsOpen(false);
			} catch (error) {
				console.error("Failed to update status:", error);
			}
		},
		[updateStatus, documentId],
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

	// Handle delete
	const handleDelete = useCallback(async () => {
		if (
			window.confirm(
				`Are you sure you want to permanently delete "${documentTitle}"? This action cannot be undone.`,
			)
		) {
			try {
				await deleteDocument({ documentId });
				toast.success("Document deleted", {
					description: `"${documentTitle}" has been permanently deleted.`,
				});
				setIsOpen(false);
			} catch (error) {
				console.error("Failed to delete document:", error);
				toast.error("Failed to delete document", {
					description: "Please try again later.",
				});
			}
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

	const defaultTrigger = (
		<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
			<MoreHorizontal className="h-4 w-4" />
			<span className="sr-only">Open menu</span>
		</Button>
	);

	return (
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
						{/* TODO: Add folder list here */}
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
				<DropdownMenuItem onClick={handleDelete} className="text-red-600">
					<Trash2 className="h-4 w-4 mr-2" />
					Delete permanently
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
