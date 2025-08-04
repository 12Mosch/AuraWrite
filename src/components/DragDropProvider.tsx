import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { useMutation } from "convex/react";
import { FileText, Folder } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export interface DragItem {
	id: string;
	type: "document" | "folder";
	data: {
		_id: Id<"documents"> | Id<"folders">;
		title?: string;
		name?: string;
	};
}

export interface DragDropProviderProps {
	children: React.ReactNode;
	onDocumentMove?: (
		documentId: Id<"documents">,
		folderId?: Id<"folders">,
	) => void;
	onFolderMove?: (folderId: Id<"folders">, parentId?: Id<"folders">) => void;
}

export const DragDropProvider: React.FC<DragDropProviderProps> = ({
	children,
	onDocumentMove,
	onFolderMove,
}) => {
	const [activeItem, setActiveItem] = useState<DragItem | null>(null);

	// Mutations
	const moveDocumentToFolder = useMutation(api.documents.moveDocumentToFolder);
	const updateFolder = useMutation(api.folders.updateFolder);

	// Sensors for drag detection
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // Require 8px of movement before drag starts
			},
		}),
	);

	const handleDragStart = useCallback((event: DragStartEvent) => {
		const { active } = event;
		const dragItem = active.data.current as DragItem;
		setActiveItem(dragItem);
	}, []);

	const handleDragOver = useCallback((_event: DragOverEvent) => {
		// Handle drag over logic if needed
		// This can be used for visual feedback during drag
	}, []);

	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			const { active, over } = event;

			setActiveItem(null);

			if (!over || active.id === over.id) {
				return;
			}

			const dragItem = active.data.current as DragItem;
			const dropTarget = over.data.current as DragItem;

			try {
				if (dragItem.type === "document") {
					// Moving a document
					const documentId = dragItem.data._id as Id<"documents">;

					if (dropTarget?.type === "folder") {
						// Drop on folder - move document to folder
						const folderId = dropTarget.data._id as Id<"folders">;
						await moveDocumentToFolder({ documentId, folderId });
						onDocumentMove?.(documentId, folderId);
					} else if (over.id === "root-folder") {
						// Drop on root - move document to root (no folder)
						await moveDocumentToFolder({ documentId, folderId: undefined });
						onDocumentMove?.(documentId, undefined);
					}
				} else if (dragItem.type === "folder") {
					// Moving a folder
					const folderId = dragItem.data._id as Id<"folders">;

					if (dropTarget?.type === "folder") {
						// Drop on another folder - make it a subfolder
						const parentId = dropTarget.data._id as Id<"folders">;
						if (parentId !== folderId) {
							// Prevent dropping folder on itself
							await updateFolder({ folderId, parentId });
							onFolderMove?.(folderId, parentId);
						}
					} else if (over.id === "root-folder") {
						// Drop on root - move folder to root level
						await updateFolder({ folderId, parentId: undefined });
						onFolderMove?.(folderId, undefined);
					}
				}
			} catch (error) {
				console.error("Drag and drop operation failed:", error);
			}
		},
		[moveDocumentToFolder, updateFolder, onDocumentMove, onFolderMove],
	);

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			{children}

			{/* Drag Overlay */}
			<DragOverlay>
				{activeItem && (
					<div className="flex items-center gap-2 px-3 py-2 bg-background border rounded-md shadow-lg">
						{activeItem.type === "document" ? (
							<FileText className="h-4 w-4" />
						) : (
							<Folder className="h-4 w-4" />
						)}
						<span className="text-sm font-medium">
							{activeItem.data.title || activeItem.data.name}
						</span>
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
};

// Hook to create drag item data
export const useDragItem = (
	type: "document" | "folder",
	id: Id<"documents"> | Id<"folders">,
	title?: string,
	name?: string,
): DragItem => {
	return {
		id: `${type}-${id}`,
		type,
		data: {
			_id: id,
			title,
			name,
		},
	};
};
