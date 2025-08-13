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

	// Extracted handlers for better maintainability and testability
	const handleDocumentDrop = useCallback(
		async (
			dragItem: DragItem,
			dropTarget: DragItem | null,
			overId: string,
			moveDocumentToFolder: (args: {
				documentId: Id<"documents">;
				folderId?: Id<"folders">;
			}) => Promise<unknown>,
			onDocumentMove?: (
				documentId: Id<"documents">,
				folderId?: Id<"folders">,
			) => void,
		) => {
			const documentId = dragItem.data._id as Id<"documents">;

			if (dropTarget?.type === "folder") {
				const folderId = dropTarget.data._id as Id<"folders">;
				await moveDocumentToFolder({ documentId, folderId });
				onDocumentMove?.(documentId, folderId);
			} else if (overId === "root-folder") {
				await moveDocumentToFolder({ documentId, folderId: undefined });
				onDocumentMove?.(documentId, undefined);
			}
		},
		[],
	);

	const handleFolderDrop = useCallback(
		async (
			dragItem: DragItem,
			dropTarget: DragItem | null,
			overId: string,
			updateFolder: (args: {
				folderId: Id<"folders">;
				parentId?: Id<"folders">;
			}) => Promise<unknown>,
			onFolderMove?: (
				folderId: Id<"folders">,
				parentId?: Id<"folders">,
			) => void,
		) => {
			const folderId = dragItem.data._id as Id<"folders">;

			if (dropTarget?.type === "folder") {
				const parentId = dropTarget.data._id as Id<"folders">;
				if (parentId !== folderId) {
					await updateFolder({ folderId, parentId });
					onFolderMove?.(folderId, parentId);
				}
			} else if (overId === "root-folder") {
				await updateFolder({ folderId, parentId: undefined });
				onFolderMove?.(folderId, undefined);
			}
		},
		[],
	);

	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			const { active, over } = event;

			setActiveItem(null);

			if (!over || active.id === over.id) {
				return;
			}

			const dragItem = active.data.current as DragItem;
			const dropTarget = over.data.current as DragItem | null;

			try {
				if (dragItem.type === "document") {
					await handleDocumentDrop(
						dragItem,
						dropTarget,
						over.id as string,
						moveDocumentToFolder,
						onDocumentMove,
					);
				} else if (dragItem.type === "folder") {
					await handleFolderDrop(
						dragItem,
						dropTarget,
						over.id as string,
						updateFolder,
						onFolderMove,
					);
				}
			} catch (error) {
				console.error("Drag and drop operation failed:", error);
			}
		},
		[
			handleDocumentDrop,
			handleFolderDrop,
			moveDocumentToFolder,
			updateFolder,
			onDocumentMove,
			onFolderMove,
		],
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
		type,
		data: {
			_id: id,
			title,
			name,
		},
	};
};
