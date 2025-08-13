import { useMutation, useQuery } from "convex/react";
import { FileText, Save, X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

// Template categories - should match the ones used in CreateDocumentModal
const TEMPLATE_CATEGORIES = [
	"business",
	"personal",
	"academic",
	"creative",
	"technical",
	"legal",
	"other",
];

export interface TemplateEditorModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	templateId?: Id<"templates">; // If provided, edit mode; if not, create mode
	onTemplateCreated?: (templateId: Id<"templates">) => void;
	onTemplateUpdated?: (templateId: Id<"templates">) => void;
	className?: string;
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
	open,
	onOpenChange,
	templateId,
	onTemplateCreated,
	onTemplateUpdated,
	className,
}) => {
	// State
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [content, setContent] = useState("");
	const [category, setCategory] = useState("business");
	const [isTeamTemplate, setIsTeamTemplate] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// Reusable form reset
	const resetForm = useCallback(() => {
		setName("");
		setDescription("");
		setContent("");
		setCategory("business");
		setIsTeamTemplate(false);
	}, []);

	// Determine if we're in edit mode
	const isEditMode = !!templateId;

	// Queries
	const existingTemplate = useQuery(
		api.templates.getTemplate,
		templateId ? { templateId } : "skip",
	);

	// Mutations
	const createTemplate = useMutation(api.templates.createTemplate);
	const updateTemplate = useMutation(api.templates.updateTemplate);

	// Load existing template data when in edit mode
	useEffect(() => {
		if (isEditMode && existingTemplate) {
			setName(existingTemplate.name);
			setDescription(existingTemplate.description || "");
			setContent(existingTemplate.content);
			setCategory(existingTemplate.category);
			setIsTeamTemplate(existingTemplate.isTeamTemplate);
		}
	}, [isEditMode, existingTemplate]);

	// Reset form when modal opens/closes
	useEffect(() => {
		if (!open) {
			// Reset form when modal closes
			resetForm();
		} else if (!isEditMode) {
			// Reset form when opening in create mode
			resetForm();
		}
	}, [open, isEditMode, resetForm]);

	// Validation
	const isValid = useCallback(() => {
		if (!name.trim()) return false;
		if (name.length > 200) return false;
		if (description.length > 500) return false;
		if (!content.trim()) return false;
		if (content.length > 1000000) return false; // 1MB limit
		if (!category.trim()) return false;
		if (category.length > 50) return false;
		return true;
	}, [name, description, content, category]);

	// Handle save
	const handleSave = useCallback(async () => {
		if (!isValid()) {
			toast.error("Please check all fields and try again");
			return;
		}

		setIsSaving(true);
		try {
			if (isEditMode && templateId) {
				// Update existing template
				await updateTemplate({
					templateId,
					name: name.trim(),
					description: description.trim() || undefined,
					content,
					category: category.trim(),
					isTeamTemplate,
				});
				toast.success("Template updated successfully");
				onTemplateUpdated?.(templateId);
			} else {
				// Create new template
				const newTemplateId = await createTemplate({
					name: name.trim(),
					description: description.trim() || undefined,
					content,
					category: category.trim(),
					isTeamTemplate,
				});
				toast.success("Template created successfully");
				onTemplateCreated?.(newTemplateId);
			}

			onOpenChange(false);
		} catch (error) {
			console.error("Failed to save template:", error);
			toast.error(
				isEditMode ? "Failed to update template" : "Failed to create template",
			);
		} finally {
			setIsSaving(false);
		}
	}, [
		isValid,
		isEditMode,
		templateId,
		name,
		description,
		content,
		category,
		isTeamTemplate,
		updateTemplate,
		createTemplate,
		onTemplateUpdated,
		onTemplateCreated,
		onOpenChange,
	]);

	// Handle content change with basic formatting
	const handleContentChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setContent(e.target.value);
		},
		[],
	);

	// Character counts for validation feedback
	const nameCharCount = name.length;
	const descriptionCharCount = description.length;
	const contentCharCount = content.length;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={cn("max-w-4xl max-h-[90vh]", className)}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<FileText className="h-5 w-5" />
						{isEditMode ? "Edit Template" : "Create New Template"}
					</DialogTitle>
					<DialogDescription>
						{isEditMode
							? "Update your template details and content"
							: "Create a reusable template for future documents"}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-6 overflow-hidden">
					{/* Template Metadata */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{/* Template Name */}
						<div className="space-y-2">
							<Label htmlFor="template-name">
								Template Name <span className="text-red-500">*</span>
							</Label>
							<Input
								id="template-name"
								placeholder="Enter template name..."
								value={name}
								onChange={(e) => setName(e.target.value)}
								className={cn(
									nameCharCount > 200 &&
										"border-red-500 focus-visible:ring-red-500",
								)}
								maxLength={250} // Allow a bit more for user feedback
							/>
							<div className="text-xs text-muted-foreground">
								{nameCharCount}/200 characters
								{nameCharCount > 200 && (
									<span className="text-red-500 ml-1">(exceeds limit)</span>
								)}
							</div>
						</div>

						{/* Category */}
						<div className="space-y-2">
							<Label htmlFor="template-category">
								Category <span className="text-red-500">*</span>
							</Label>
							<Select value={category} onValueChange={setCategory}>
								<SelectTrigger>
									<SelectValue placeholder="Select category" />
								</SelectTrigger>
								<SelectContent>
									{TEMPLATE_CATEGORIES.map((cat) => (
										<SelectItem key={cat} value={cat}>
											{cat.charAt(0).toUpperCase() + cat.slice(1)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Description */}
					<div className="space-y-2">
						<Label htmlFor="template-description">Description</Label>
						<Textarea
							id="template-description"
							placeholder="Describe what this template is for..."
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className={cn(
								"min-h-20 max-h-32",
								descriptionCharCount > 500 &&
									"border-red-500 focus-visible:ring-red-500",
							)}
							maxLength={550} // Allow a bit more for user feedback
						/>
						<div className="text-xs text-muted-foreground">
							{descriptionCharCount}/500 characters
							{descriptionCharCount > 500 && (
								<span className="text-red-500 ml-1">(exceeds limit)</span>
							)}
						</div>
					</div>

					{/* Team Template Toggle */}
					<div className="flex items-center space-x-2">
						<Checkbox
							id="team-template"
							checked={isTeamTemplate}
							onCheckedChange={(checked: boolean) => setIsTeamTemplate(checked)}
						/>
						<Label htmlFor="team-template" className="text-sm">
							Make this template available to all team members
						</Label>
					</div>

					{/* Content Editor */}
					<div className="flex-1 flex flex-col space-y-2 min-h-0">
						<Label htmlFor="template-content">
							Template Content <span className="text-red-500">*</span>
						</Label>
						<Textarea
							id="template-content"
							placeholder="Enter your template content here..."
							value={content}
							onChange={handleContentChange}
							className={cn(
								"flex-1 min-h-64 font-mono text-sm",
								contentCharCount > 1000000 &&
									"border-red-500 focus-visible:ring-red-500",
							)}
						/>
						<div className="text-xs text-muted-foreground">
							{(contentCharCount / 1000).toFixed(1)}K/1000K characters
							{contentCharCount > 1000000 && (
								<span className="text-red-500 ml-1">(exceeds 1MB limit)</span>
							)}
						</div>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-end gap-3 pt-4 border-t">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							<X className="h-4 w-4 mr-2" />
							Cancel
						</Button>
						<Button
							onClick={handleSave}
							disabled={!isValid() || isSaving}
							className="min-w-32"
						>
							<Save className="h-4 w-4 mr-2" />
							{isSaving
								? "Saving..."
								: isEditMode
									? "Update Template"
									: "Create Template"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
