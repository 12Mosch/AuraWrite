import { useDraggable } from "@dnd-kit/core";
import { Calendar, FileText, Globe, Lock, Star } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DocumentActionsMenu } from "./DocumentActionsMenu";
import { useDragItem } from "./DragDropProvider";
import { InlineEditableTitle } from "./InlineEditableTitle";
import type { Document } from "./MainContent";
import { StatusBadge } from "./StatusBadge";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Checkbox } from "./ui/checkbox";

export interface DocumentCardProps {
	document: Document;
	selected?: boolean;
	onSelect?: (selected: boolean) => void;
	onOpen?: () => void;
	className?: string;
}

const formatDate = (timestamp: number, locale: string = "en-US"): string => {
	const date = new Date(timestamp);
	const now = new Date();
	const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

	if (diffInHours < 24) {
		return date.toLocaleTimeString(locale, {
			hour: "2-digit",
			minute: "2-digit",
		});
	} else if (diffInHours < 24 * 7) {
		return date.toLocaleDateString(locale, { weekday: "short" });
	} else {
		return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
	}
};

const getDocumentPreview = (content?: string): string => {
	if (!content) return "No content";

	try {
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			// Extract text from Slate.js format
			const text = parsed
				.map((node: unknown) => {
					type SlateTextChild = { text?: unknown };
					type SlateNode = { children?: unknown };
					const n = node as SlateNode | null;
					if (n && Array.isArray(n.children)) {
						return (n.children as unknown[])
							.map((child: unknown) => {
								const c = child as SlateTextChild | null;
								if (c && typeof c === "object" && "text" in c) {
									return String(c.text ?? "");
								}
								return "";
							})
							.join("");
					}
					return "";
				})
				.join(" ")
				.trim();

			return text || "No content";
		}
	} catch {
		// Fallback for plain text
		return content.slice(0, 100) + (content.length > 100 ? "..." : "");
	}

	return "No content";
};

export const DocumentCard: React.FC<DocumentCardProps> = ({
	document,
	selected = false,
	onSelect,
	onOpen,
	className,
}) => {
	const [isHovered, setIsHovered] = useState(false);

	// Drag and drop setup
	const dragItem = useDragItem("document", document._id, document.title);
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id: dragItem.data._id,
			data: dragItem,
		});

	const preview = getDocumentPreview(document.content);
	const lastModified = formatDate(document.updatedAt, "en-US");

	const dragStyle = transform
		? {
				transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
			}
		: undefined;

	const handleCardClick = (e: React.MouseEvent) => {
		// Don't trigger if clicking on dropdown or other interactive elements
		if (
			(e.target as HTMLElement).closest("[data-dropdown-trigger]") ||
			(e.target as HTMLElement).closest("button")
		) {
			return;
		}

		if (onOpen) {
			onOpen();
		}
	};

	return (
		<Card
			ref={setNodeRef}
			className={cn(
				"group cursor-pointer transition-all duration-200 hover:shadow-md",
				"border-2 hover:border-primary/20",
				selected && "border-primary bg-primary/5",
				isDragging && "opacity-50",
				className,
			)}
			style={dragStyle}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			onClick={handleCardClick}
			{...attributes}
			{...listeners}
		>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-start gap-3 flex-1 min-w-0">
						{/* Document Icon */}
						<div className="flex-shrink-0 mt-0.5">
							<FileText className="h-5 w-5 text-muted-foreground" />
						</div>

						{/* Title and Metadata */}
						<div className="flex-1 min-w-0">
							<div className="font-medium text-sm leading-tight">
								<InlineEditableTitle
									documentId={document._id}
									title={document.title}
									className="min-w-0"
								/>
							</div>
							<div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
								<Calendar className="h-3 w-3" />
								<span>{lastModified}</span>
								{document.isPublic ? (
									<Globe className="h-3 w-3" />
								) : (
									<Lock className="h-3 w-3" />
								)}
							</div>
						</div>
					</div>

					{/* Actions */}
					<div className="flex items-center gap-1">
						{/* Favorite Star */}
						{document.isFavorite && (
							<Star className="h-4 w-4 text-yellow-500 fill-current" />
						)}

						{/* More Actions */}
						<DocumentActionsMenu
							documentId={document._id}
							documentTitle={document.title}
							isFavorite={document.isFavorite}
							status={document.status}
							onEdit={onOpen}
							className={cn(
								"opacity-0 group-hover:opacity-100 transition-opacity",
								isHovered && "opacity-100",
							)}
						/>
					</div>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				{/* Preview Text */}
				<p
					className="text-sm text-muted-foreground mb-3 overflow-hidden"
					style={{
						display: "-webkit-box",
						WebkitLineClamp: 3,
						WebkitBoxOrient: "vertical",
					}}
				>
					{preview}
				</p>

				{/* Tags and Status */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1 flex-wrap">
						<StatusBadge status={document.status} size="sm" />
						{document.tags?.slice(0, 2).map((tag) => (
							<Badge key={tag} variant="outline" className="text-xs">
								{tag}
							</Badge>
						))}
						{document.tags && document.tags.length > 2 && (
							<Badge variant="outline" className="text-xs">
								+{document.tags.length - 2}
							</Badge>
						)}
					</div>

					{/* Selection Checkbox */}
					{onSelect && (
						<span className="opacity-0 group-hover:opacity-100 transition-opacity">
							<Checkbox
								checked={selected}
								onCheckedChange={(checked) => {
									if (typeof checked === "boolean") {
										onSelect(checked);
									}
								}}
								onClick={(e) => e.stopPropagation()}
								className="size-4"
								aria-label="Select document"
							/>
						</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
