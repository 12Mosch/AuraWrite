import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronDown,
	ChevronRight,
	Folder,
	FolderPlus,
	MoreHorizontal,
	Plus,
} from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDragItem } from "./DragDropProvider";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";

export interface FolderTreeProps {
	selectedFolderId?: Id<"folders">;
	onFolderSelect?: (folderId?: Id<"folders">) => void;
	onFolderCreate?: (name: string, parentId?: Id<"folders">) => void;
	onFolderRename?: (folderId: Id<"folders">, newName: string) => void;
	onFolderDelete?: (folderId: Id<"folders">) => void;
	className?: string;
	showCreateButton?: boolean;
}

interface FolderWithChildren {
	_id: Id<"folders">;
	name: string;
	color?: string;
	parentId?: Id<"folders">;
	ownerId: Id<"users">;
	createdAt: number;
	updatedAt: number;
	_creationTime: number;
	children: FolderWithChildren[];
}

interface FolderNodeProps {
	folder: FolderWithChildren;
	level: number;
	isSelected: boolean;
	isExpanded: boolean;
	onToggleExpand: (folderId: Id<"folders">) => void;
	onSelect: (folderId: Id<"folders">) => void;
	onCreateChild: (parentId: Id<"folders">) => void;
	onRename: (folderId: Id<"folders">) => void;
	onDelete: (folderId: Id<"folders">) => void;
	isCreating: boolean;
	isRenaming: boolean;
	onCancelCreate: () => void;
	onCancelRename: () => void;
	onConfirmCreate: (name: string) => void;
	onConfirmRename: (name: string) => void;
	// Per-node state derivation helpers passed from parent
	getIsSelected: (folderId: Id<"folders">) => boolean;
	getIsExpanded: (folderId: Id<"folders">) => boolean;
	// Bubble up state setters from FolderTree so deeply nested nodes can access them
	setCreatingInFolder: (folderId: Id<"folders"> | null) => void;
	setRenamingFolder: (folderId: Id<"folders"> | null) => void;
	handleCreateFolder: (name: string, parentId?: Id<"folders">) => Promise<void>;
	handleRenameFolder: (
		folderId: Id<"folders">,
		newName: string,
	) => Promise<void>;
	handleDeleteFolder: (folderId: Id<"folders">) => Promise<void>;
}

const FolderNode: React.FC<FolderNodeProps> = ({
	folder,
	level,
	isSelected,
	isExpanded,
	onToggleExpand,
	onSelect,
	onCreateChild,
	onRename,
	onDelete,
	isCreating,
	isRenaming,
	onCancelCreate,
	onCancelRename,
	onConfirmCreate,
	onConfirmRename,
	getIsSelected,
	getIsExpanded,
	setCreatingInFolder,
	setRenamingFolder,
	handleCreateFolder,
	handleRenameFolder,
	handleDeleteFolder,
}) => {
	const [createName, setCreateName] = useState("");
	const [renameName, setRenameName] = useState(folder.name);

	// Drag and drop setup
	const dragItem = useDragItem("folder", folder._id, undefined, folder.name);
	const {
		attributes,
		listeners,
		setNodeRef: setDragRef,
		transform,
		isDragging,
	} = useDraggable({
		id: `folder-${folder._id}`,
		data: dragItem,
	});

	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: `folder-drop-${folder._id}`,
		data: dragItem,
	});

	// Combine refs
	const setNodeRef = useCallback(
		(node: HTMLElement | null) => {
			setDragRef(node);
			setDropRef(node);
		},
		[setDragRef, setDropRef],
	);

	const handleCreateSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (createName.trim()) {
				onConfirmCreate(createName.trim());
				setCreateName("");
			}
		},
		[createName, onConfirmCreate],
	);

	const handleRenameSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (renameName.trim() && renameName.trim() !== folder.name) {
				onConfirmRename(renameName.trim());
			} else {
				onCancelRename();
			}
		},
		[renameName, folder.name, onConfirmRename, onCancelRename],
	);

	const hasChildren = folder.children.length > 0;

	const dragStyle = transform
		? {
				transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
			}
		: undefined;

	return (
		<div>
			{/* Folder Item */}
			<div
				ref={setNodeRef}
				className={cn(
					"flex items-center gap-1 py-1 px-2 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer group",
					isSelected && "bg-accent text-accent-foreground",
					isDragging && "opacity-50",
					isOver && "bg-accent/50",
				)}
				style={{
					paddingLeft: `${level * 12 + 8}px`,
					...dragStyle,
				}}
				{...attributes}
				{...listeners}
			>
				{/* Expand/Collapse Button */}
				<Button
					variant="ghost"
					size="sm"
					className="h-4 w-4 p-0 hover:bg-transparent"
					onClick={() => onToggleExpand(folder._id)}
					disabled={!hasChildren}
				>
					{hasChildren ? (
						isExpanded ? (
							<ChevronDown className="h-3 w-3" />
						) : (
							<ChevronRight className="h-3 w-3" />
						)
					) : (
						<div className="h-3 w-3" />
					)}
				</Button>

				{/* Folder Icon */}
				<Folder
					className="h-4 w-4 flex-shrink-0"
					style={{ color: folder.color || undefined }}
				/>

				{/* Folder Name or Rename Input */}
				{isRenaming ? (
					<form onSubmit={handleRenameSubmit} className="flex-1">
						<Input
							value={renameName}
							onChange={(e) => setRenameName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									e.preventDefault();
									onCancelRename();
								} else if (e.key === "Enter") {
									e.preventDefault();
									const form = e.currentTarget.form;
									if (form) {
										form.requestSubmit();
									}
								}
							}}
							autoFocus
							className="h-6 text-sm"
						/>
					</form>
				) : (
					<Button
						variant="ghost"
						className="flex-1 text-sm truncate justify-start p-0 h-auto font-normal"
						onClick={() => onSelect(folder._id)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onSelect(folder._id);
							}
						}}
					>
						{folder.name}
					</Button>
				)}

				{/* Actions Menu */}
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
							onClick={() => {
								onCreateChild(folder._id);
								// ensure parent state is set when triggered from deep node
								setCreatingInFolder(folder._id);
							}}
						>
							<FolderPlus className="h-4 w-4 mr-2" />
							New Subfolder
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => {
								onRename(folder._id);
								setRenamingFolder(folder._id);
							}}
						>
							Rename
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => {
								onDelete(folder._id);
								handleDeleteFolder(folder._id);
							}}
							className="text-destructive"
						>
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Create Child Input */}
			{isCreating && (
				<div
					style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
					className="py-1 px-2"
				>
					<form
						onSubmit={handleCreateSubmit}
						className="flex items-center gap-1"
					>
						<div className="h-4 w-4" /> {/* Spacer for expand button */}
						<FolderPlus className="h-4 w-4 text-muted-foreground" />
						<Input
							value={createName}
							onChange={(e) => setCreateName(e.target.value)}
							onBlur={() => {
								onCancelCreate();
								// also clear parent state if this inline create loses focus
								setCreatingInFolder(null);
							}}
							placeholder="Folder name"
							autoFocus
							className="h-6 text-sm flex-1"
						/>
					</form>
				</div>
			)}

			{/* Children */}
			{isExpanded && hasChildren && (
				<div>
					{folder.children.map((child) => (
						<FolderNode
							key={child._id}
							folder={child}
							level={level + 1}
							isSelected={getIsSelected(child._id)}
							isExpanded={getIsExpanded(child._id)}
							onToggleExpand={onToggleExpand}
							onSelect={onSelect}
							onCreateChild={onCreateChild}
							onRename={onRename}
							onDelete={onDelete}
							isCreating={false}
							isRenaming={false}
							onCancelCreate={onCancelCreate}
							onCancelRename={onCancelRename}
							onConfirmCreate={(name) => handleCreateFolder(name, child._id)}
							onConfirmRename={(name) => handleRenameFolder(child._id, name)}
							getIsSelected={getIsSelected}
							getIsExpanded={getIsExpanded}
							setCreatingInFolder={setCreatingInFolder}
							setRenamingFolder={setRenamingFolder}
							handleCreateFolder={handleCreateFolder}
							handleRenameFolder={handleRenameFolder}
							handleDeleteFolder={handleDeleteFolder}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export const FolderTree: React.FC<FolderTreeProps> = ({
	selectedFolderId,
	onFolderSelect,
	onFolderCreate,
	onFolderRename,
	onFolderDelete,
	className,
	showCreateButton = true,
}) => {
	const [expandedFolders, setExpandedFolders] = useState<Set<Id<"folders">>>(
		new Set(),
	);
	const [creatingInFolder, setCreatingInFolder] =
		useState<Id<"folders"> | null>(null);
	const [renamingFolder, setRenamingFolder] = useState<Id<"folders"> | null>(
		null,
	);
	const [isCreatingRoot, setIsCreatingRoot] = useState(false);

	// Root drop zone for moving folders to root level
	const { setNodeRef: setRootDropRef, isOver: isRootOver } = useDroppable({
		id: "root-folder",
		data: { type: "root" },
	});

	// Fetch folder tree
	const folderTree = useQuery(api.folders.getFolderTree);

	// Mutations
	const createFolder = useMutation(api.folders.createFolder);
	const updateFolder = useMutation(api.folders.updateFolder);
	const deleteFolder = useMutation(api.folders.deleteFolder);

	// Handle expand/collapse
	const handleToggleExpand = useCallback((folderId: Id<"folders">) => {
		setExpandedFolders((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(folderId)) {
				newSet.delete(folderId);
			} else {
				newSet.add(folderId);
			}
			return newSet;
		});
	}, []);

	// Handle folder selection
	const handleFolderSelect = useCallback(
		(folderId: Id<"folders">) => {
			onFolderSelect?.(folderId);
		},
		[onFolderSelect],
	);

	// Handle create folder
	const handleCreateFolder = useCallback(
		async (name: string, parentId?: Id<"folders">) => {
			try {
				await createFolder({ name, parentId });
				onFolderCreate?.(name, parentId);
				setCreatingInFolder(null);
				setIsCreatingRoot(false);
			} catch (error) {
				console.error("Failed to create folder:", error);
			}
		},
		[createFolder, onFolderCreate],
	);

	// Handle rename folder
	const handleRenameFolder = useCallback(
		async (folderId: Id<"folders">, newName: string) => {
			try {
				await updateFolder({ folderId, name: newName });
				onFolderRename?.(folderId, newName);
				setRenamingFolder(null);
			} catch (error) {
				console.error("Failed to rename folder:", error);
			}
		},
		[updateFolder, onFolderRename],
	);

	// Handle delete folder
	const handleDeleteFolder = useCallback(
		async (folderId: Id<"folders">) => {
			try {
				await deleteFolder({ folderId });
				onFolderDelete?.(folderId);
			} catch (error) {
				console.error("Failed to delete folder:", error);
			}
		},
		[deleteFolder, onFolderDelete],
	);

	return (
		<div
			ref={setRootDropRef}
			className={cn(
				"space-y-1",
				className,
				isRootOver && "bg-accent/20 rounded-md",
			)}
		>
			{/* Create Root Folder Button */}
			{showCreateButton && (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setIsCreatingRoot(true)}
					className="w-full justify-start h-8 px-2"
				>
					<Plus className="h-4 w-4 mr-2" />
					New Folder
				</Button>
			)}

			{/* Root Create Input */}
			{isCreatingRoot && (
				<div className="px-2 py-1">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							const input = e.currentTarget.elements.namedItem(
								"folderName",
							) as HTMLInputElement;
							if (input.value.trim()) {
								handleCreateFolder(input.value.trim());
							}
						}}
					>
						<div className="flex items-center gap-1">
							<FolderPlus className="h-4 w-4 text-muted-foreground" />
							<Input
								name="folderName"
								placeholder="Folder name"
								autoFocus
								onBlur={() => setIsCreatingRoot(false)}
								className="h-6 text-sm flex-1"
							/>
						</div>
					</form>
				</div>
			)}

			{/* Folder Tree */}
			{folderTree?.map((folder) => (
				<FolderNode
					key={folder._id}
					folder={folder}
					level={0}
					isSelected={selectedFolderId === folder._id}
					isExpanded={expandedFolders.has(folder._id)}
					onToggleExpand={handleToggleExpand}
					onSelect={handleFolderSelect}
					onCreateChild={(parentId) => setCreatingInFolder(parentId)}
					onRename={(folderId) => setRenamingFolder(folderId)}
					onDelete={handleDeleteFolder}
					isCreating={creatingInFolder === folder._id}
					isRenaming={renamingFolder === folder._id}
					onCancelCreate={() => setCreatingInFolder(null)}
					onCancelRename={() => setRenamingFolder(null)}
					onConfirmCreate={(name) => handleCreateFolder(name, folder._id)}
					onConfirmRename={(name) => handleRenameFolder(folder._id, name)}
					getIsSelected={(id) => selectedFolderId === id}
					getIsExpanded={(id) => expandedFolders.has(id)}
					setCreatingInFolder={setCreatingInFolder}
					setRenamingFolder={setRenamingFolder}
					handleCreateFolder={handleCreateFolder}
					handleRenameFolder={handleRenameFolder}
					handleDeleteFolder={handleDeleteFolder}
				/>
			))}

			{/* Empty State */}
			{folderTree?.length === 0 && !isCreatingRoot && (
				<div className="text-center py-8 text-muted-foreground">
					<Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
					<p className="text-sm">No folders yet</p>
					{showCreateButton && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsCreatingRoot(true)}
							className="mt-2"
						>
							Create your first folder
						</Button>
					)}
				</div>
			)}
		</div>
	);
};
