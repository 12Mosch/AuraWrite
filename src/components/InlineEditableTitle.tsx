import { useMutation } from "convex/react";
import { Check, Edit2, X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface InlineEditableTitleProps {
	documentId: Id<"documents">;
	title: string;
	className?: string;
	inputClassName?: string;
	onTitleChange?: (newTitle: string) => void;
	disabled?: boolean;
	maxLength?: number;
}

export const InlineEditableTitle: React.FC<InlineEditableTitleProps> = ({
	documentId,
	title,
	className,
	inputClassName,
	onTitleChange,
	disabled = false,
	maxLength = 100,
}) => {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(title);
	const [isLoading, setIsLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Mutation
	const updateDocument = useMutation(api.documents.updateDocument);

	// Update edit value when title prop changes
	useEffect(() => {
		setEditValue(title);
	}, [title]);

	// Focus input when editing starts
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	// Handle starting edit mode
	const handleStartEdit = useCallback(() => {
		if (disabled) return;
		setIsEditing(true);
		setEditValue(title);
	}, [disabled, title]);

	// Handle keyboard events for accessibility
	const handleEditKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				handleStartEdit();
			}
		},
		[handleStartEdit],
	);

	// Handle canceling edit
	const handleCancel = useCallback(() => {
		setIsEditing(false);
		setEditValue(title);
	}, [title]);

	// Handle saving changes
	const handleSave = useCallback(async () => {
		const trimmedValue = editValue.trim();

		// Validate title
		if (!trimmedValue) {
			toast.error("Invalid title", {
				description: "Document title cannot be empty.",
			});
			return;
		}

		if (trimmedValue === title) {
			setIsEditing(false);
			return;
		}

		setIsLoading(true);
		try {
			await updateDocument({
				documentId,
				title: trimmedValue,
			});

			setIsEditing(false);
			onTitleChange?.(trimmedValue);

			toast.success("Title updated", {
				description: `Document renamed to "${trimmedValue}".`,
			});
		} catch (error) {
			console.error("Failed to update document title:", error);
			toast.error("Failed to update title", {
				description: "Please try again later.",
			});
		} finally {
			setIsLoading(false);
		}
	}, [editValue, title, documentId, updateDocument, onTitleChange]);

	// Handle keyboard events
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleSave();
			} else if (e.key === "Escape") {
				e.preventDefault();
				handleCancel();
			}
		},
		[handleSave, handleCancel],
	);

	// Handle input change
	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			if (value.length <= maxLength) {
				setEditValue(value);
			}
		},
		[maxLength],
	);

	// Handle click outside to save
	const handleBlur = useCallback(() => {
		if (isEditing && !isLoading) {
			handleSave();
		}
	}, [isEditing, isLoading, handleSave]);

	if (isEditing) {
		return (
			<div className="flex items-center gap-1 min-w-0 flex-1">
				<Input
					ref={inputRef}
					value={editValue}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					onBlur={handleBlur}
					disabled={isLoading}
					className={cn("h-7 text-sm", inputClassName)}
					placeholder="Enter document title..."
				/>
				<div className="flex items-center gap-1 flex-shrink-0">
					<Button
						size="sm"
						variant="ghost"
						onClick={handleSave}
						disabled={isLoading || !editValue.trim()}
						className="h-6 w-6 p-0"
					>
						<Check className="h-3 w-3" />
						<span className="sr-only">Save</span>
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={handleCancel}
						disabled={isLoading}
						className="h-6 w-6 p-0"
					>
						<X className="h-3 w-3" />
						<span className="sr-only">Cancel</span>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className={cn("group flex items-center gap-1 min-w-0", className)}>
			<button
				type="button"
				className={cn(
					"flex-1 min-w-0 text-left bg-transparent p-0 border-0 truncate",
					!disabled && "cursor-pointer hover:text-primary",
					disabled && "cursor-default",
				)}
				onClick={!disabled ? handleStartEdit : undefined}
				onKeyDown={!disabled ? handleEditKeyDown : undefined}
				disabled={disabled}
				aria-label={!disabled ? `Edit title: ${title}` : undefined}
				title={title}
			>
				{title}
			</button>
			{!disabled && (
				<button
					type="button"
					className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 inline-flex items-center justify-center rounded-sm hover:bg-accent hover:text-accent-foreground border-0 bg-transparent"
					onClick={(e) => {
						e.stopPropagation();
						handleStartEdit();
					}}
					aria-label="Edit title"
				>
					<Edit2 className="h-3 w-3" />
				</button>
			)}
		</div>
	);
};
