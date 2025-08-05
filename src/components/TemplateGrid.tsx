import { FileText, Plus, PlusCircle } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { TemplateCard } from "./TemplateCard";
import { Card, CardContent, CardHeader } from "./ui/card";

export interface TemplateGridProps {
	templates: Doc<"templates">[];
	selectedTemplateId?: Id<"templates">;
	onTemplateSelect?: (templateId?: Id<"templates">) => void;
	onTemplatePreview?: (templateId: Id<"templates">) => void;
	onCreateTemplate?: () => void;
	showBlankOption?: boolean;
	showCreateOption?: boolean;
	isLoading?: boolean;
	className?: string;
}

export const TemplateGrid: React.FC<TemplateGridProps> = ({
	templates,
	selectedTemplateId,
	onTemplateSelect,
	onTemplatePreview,
	onCreateTemplate,
	showBlankOption = true,
	showCreateOption = true,
	isLoading = false,
	className,
}) => {
	const handleBlankSelect = () => {
		onTemplateSelect?.(undefined);
	};

	const handleTemplateSelect = (templateId: Id<"templates">) => {
		onTemplateSelect?.(templateId);
	};

	const handleCreateTemplate = () => {
		onCreateTemplate?.();
	};

	if (isLoading) {
		return (
			<div
				className={cn(
					"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",
					className,
				)}
			>
				{Array.from({ length: 6 })
					.map((_, i) => `skeleton-${i}`)
					.map((key) => (
						<Card key={key} className="animate-pulse">
							<CardHeader className="pb-3">
								<div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
								<div className="h-3 bg-gray-200 rounded w-1/2" />
							</CardHeader>
							<CardContent className="pt-0">
								<div className="space-y-2">
									<div className="h-3 bg-gray-200 rounded w-full" />
									<div className="h-3 bg-gray-200 rounded w-2/3" />
								</div>
							</CardContent>
						</Card>
					))}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",
				className,
			)}
		>
			{/* Create Template Option */}
			{showCreateOption && (
				<Card
					className="cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] border-dashed border-2 border-primary/30 hover:border-primary/50"
					onClick={handleCreateTemplate}
				>
					<CardHeader className="pb-3">
						<div className="flex items-center gap-2">
							<PlusCircle className="h-5 w-5 text-primary" />
							<h3 className="font-medium text-sm text-primary">
								Create Template
							</h3>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						<p className="text-xs text-muted-foreground">
							Create a new reusable template for future documents
						</p>
					</CardContent>
				</Card>
			)}

			{/* Blank Document Option */}
			{showBlankOption && (
				<Card
					className={cn(
						"cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
						!selectedTemplateId && "ring-2 ring-primary shadow-md",
					)}
					onClick={handleBlankSelect}
				>
					<CardHeader className="pb-3">
						<div className="flex items-center gap-2">
							<Plus className="h-5 w-5 text-primary" />
							<h3 className="font-medium text-sm">Blank Document</h3>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						<p className="text-xs text-muted-foreground">
							Start with an empty document and build from scratch
						</p>
					</CardContent>
				</Card>
			)}

			{/* Template Cards */}
			{templates.map((template) => (
				<TemplateCard
					key={template._id}
					template={template}
					selected={selectedTemplateId === template._id}
					onSelect={handleTemplateSelect}
					onPreview={onTemplatePreview}
				/>
			))}

			{/* Empty State */}
			{templates.length === 0 && !isLoading && (
				<div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
					<FileText className="h-12 w-12 text-muted-foreground mb-4" />
					<h3 className="font-medium text-lg mb-2">No templates found</h3>
					<p className="text-sm text-muted-foreground max-w-md">
						No templates match your current search criteria. Try adjusting your
						filters or search terms.
					</p>
				</div>
			)}
		</div>
	);
};
