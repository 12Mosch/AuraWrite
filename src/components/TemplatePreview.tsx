import { useQuery } from "convex/react";
import { Calendar, Edit2, FileText, Users } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// Types for Slate.js content structure
interface SlateText {
	text: string;
}

interface SlateNode {
	children?: SlateText[];
}

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Separator } from "./ui/separator";

export interface TemplatePreviewProps {
	templateId?: Id<"templates">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUseTemplate?: (templateId: Id<"templates">) => void;
	onEditTemplate?: (templateId: Id<"templates">) => void;
	className?: string;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
	templateId,
	open,
	onOpenChange,
	onUseTemplate,
	onEditTemplate,
	className,
}) => {
	// Query template data
	const template = useQuery(
		api.templates.getTemplate,
		templateId ? { templateId } : "skip",
	);

	// Query current user to check edit permissions
	const currentUser = useQuery(api.users.getCurrentUser);

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	const handleUseTemplate = () => {
		if (template && onUseTemplate) {
			onUseTemplate(template._id);
			onOpenChange(false);
		}
	};

	const handleEditTemplate = () => {
		if (template && onEditTemplate) {
			onEditTemplate(template._id);
			onOpenChange(false);
		}
	};

	// Check if current user can edit this template
	const canEdit =
		currentUser && template && currentUser._id === template.createdBy;

	// Parse template content for preview
	const getContentPreview = (content: string) => {
		// Guard against null/undefined/empty content
		if (!content) return "No content available";

		try {
			const parsed = JSON.parse(content);
			if (Array.isArray(parsed)) {
				// Extract text from Slate.js format
				const extractedText = parsed
					.map((node: SlateNode) => {
						if (node?.children && Array.isArray(node.children)) {
							return node.children
								.map((child: SlateText) => child?.text || "")
								.join("")
								.trim();
						}
						return "";
					})
					.filter(Boolean)
					.join("\n");

				// Limit preview length after assembling the full text
				return extractedText.slice(0, 500);
			}
		} catch {
			// Fallback for plain text or other formats
			return content.slice(0, 500);
		}
		return "No content preview available";
	};

	if (!template) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className={cn("max-w-2xl max-h-[80vh]", className)}>
					<div className="flex items-center justify-center py-12">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={cn("max-w-2xl max-h-[80vh]", className)}>
				<DialogHeader>
					<div className="flex items-start justify-between gap-4">
						<div className="flex-1 min-w-0">
							<DialogTitle className="text-xl">{template.name}</DialogTitle>
							<DialogDescription className="mt-1">
								{template.description || "No description available"}
							</DialogDescription>
						</div>
						<FileText className="h-6 w-6 text-muted-foreground flex-shrink-0" />
					</div>
				</DialogHeader>

				<div className="flex flex-col gap-4 overflow-hidden">
					{/* Template Metadata */}
					<div className="flex items-center gap-4 text-sm text-muted-foreground">
						<div className="flex items-center gap-1">
							<Calendar className="h-4 w-4" />
							<span>Created {formatDate(template.createdAt)}</span>
						</div>
						<Separator orientation="vertical" className="h-4" />
						<Badge variant="secondary" className="text-xs">
							{template.category}
						</Badge>
						{template.isTeamTemplate && (
							<Badge
								variant="outline"
								className="text-xs bg-blue-50 text-blue-700 border-blue-200"
							>
								<Users className="h-3 w-3 mr-1" />
								Team Template
							</Badge>
						)}
					</div>

					<Separator />

					{/* Content Preview */}
					<div className="flex-1 overflow-hidden">
						<h3 className="font-medium text-sm mb-3">Content Preview</h3>
						<Card className="h-64 overflow-hidden">
							<CardContent className="p-4 h-full overflow-y-auto">
								<div className="text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
									{getContentPreview(template.content)}
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-end gap-3 pt-4 border-t">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Close
						</Button>
						{canEdit && (
							<Button
								variant="outline"
								onClick={handleEditTemplate}
								className="gap-2"
							>
								<Edit2 className="h-4 w-4" />
								Edit Template
							</Button>
						)}
						<Button onClick={handleUseTemplate} className="gap-2">
							<FileText className="h-4 w-4" />
							Use This Template
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
