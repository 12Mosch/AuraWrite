import { Calendar, FileText, Users } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader } from "./ui/card";

interface Template {
	_id: Id<"templates">;
	name: string;
	description?: string;
	content: string;
	category: string;
	isTeamTemplate: boolean;
	createdBy: Id<"users">;
	createdAt: number;
	updatedAt: number;
	_creationTime: number;
}

export interface TemplateCardProps {
	template: Template;
	selected?: boolean;
	onSelect?: (templateId: Id<"templates">) => void;
	onPreview?: (templateId: Id<"templates">) => void;
	className?: string;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
	template,
	selected = false,
	onSelect,
	onPreview,
	className,
}) => {
	const handleClick = () => {
		onSelect?.(template._id);
	};

	const handlePreview = (e: React.MouseEvent) => {
		e.stopPropagation();
		onPreview?.(template._id);
	};

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<Card
			className={cn(
				"cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
				selected && "ring-2 ring-primary shadow-md",
				className,
			)}
			onClick={handleClick}
		>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1 min-w-0">
						<h3 className="font-medium text-sm truncate" title={template.name}>
							{template.name}
						</h3>
						<div className="flex items-center gap-2 mt-1">
							<Badge variant="secondary" className="text-xs px-2 py-0.5 h-5">
								{template.category}
							</Badge>
							{template.isTeamTemplate && (
								<Badge
									variant="outline"
									className="text-xs px-2 py-0.5 h-5 bg-blue-50 text-blue-700 border-blue-200"
								>
									<Users className="h-3 w-3 mr-1" />
									Team
								</Badge>
							)}
						</div>
					</div>
					<FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<p className="text-xs text-muted-foreground line-clamp-3 mb-3">
					{template.description || "No description available"}
				</p>

				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<div className="flex items-center gap-1">
						<Calendar className="h-3 w-3" />
						<span>{formatDate(template.createdAt)}</span>
					</div>
					{onPreview && (
						<button
							type="button"
							onClick={handlePreview}
							className="text-primary hover:text-primary/80 font-medium transition-colors"
						>
							Preview
						</button>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
