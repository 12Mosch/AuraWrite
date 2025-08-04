import {
	Calendar,
	Copy,
	FileText,
	Globe,
	Lock,
	MoreHorizontal,
	Share2,
	Star,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

import type { Document } from "./MainContent";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export interface DocumentCardProps {
	document: Document;
	selected?: boolean;
	onSelect?: (selected: boolean) => void;
	onOpen?: () => void;
	className?: string;
}

const formatDate = (timestamp: number): string => {
	const date = new Date(timestamp);
	const now = new Date();
	const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

	if (diffInHours < 24) {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	} else if (diffInHours < 24 * 7) {
		return date.toLocaleDateString([], { weekday: "short" });
	} else {
		return date.toLocaleDateString([], { month: "short", day: "numeric" });
	}
};

const getDocumentPreview = (content?: string): string => {
	if (!content) return "No content";

	try {
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			// Extract text from Slate.js format
			const text = parsed
				.map((node) => {
					if (node.children) {
						return node.children
							.map((child: { text?: string }) => child.text || "")
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
		return content.substring(0, 100);
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

	const preview = getDocumentPreview(document.content);
	const lastModified = formatDate(document.updatedAt);

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

	const handleSelectChange = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (onSelect) {
			onSelect(!selected);
		}
	};

	return (
		<Card
			className={cn(
				"group cursor-pointer transition-all duration-200 hover:shadow-md",
				"border-2 hover:border-primary/20",
				selected && "border-primary bg-primary/5",
				className,
			)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			onClick={handleCardClick}
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
							<h3 className="font-medium text-sm leading-tight truncate">
								{document.title}
							</h3>
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
						<DropdownMenu>
							<DropdownMenuTrigger asChild data-dropdown-trigger>
								<Button
									variant="ghost"
									size="sm"
									className={cn(
										"h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity",
										isHovered && "opacity-100",
									)}
								>
									<MoreHorizontal className="h-4 w-4" />
									<span className="sr-only">More actions</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-48">
								<DropdownMenuItem onClick={onOpen}>
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
						{document.status && (
							<Badge variant="secondary" className="text-xs">
								{document.status}
							</Badge>
						)}
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
						<Button
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
							onClick={handleSelectChange}
						>
							<div
								className={cn(
									"h-4 w-4 border-2 rounded",
									selected
										? "bg-primary border-primary"
										: "border-muted-foreground",
								)}
							>
								{selected && (
									<div className="h-full w-full flex items-center justify-center">
										<div className="h-2 w-2 bg-primary-foreground rounded-sm" />
									</div>
								)}
							</div>
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
