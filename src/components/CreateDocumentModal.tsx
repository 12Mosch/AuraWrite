import { useMutation, useQuery } from "convex/react";
import { FileText, FolderOpen, Search } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useReducer } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TemplateEditorModal } from "./TemplateEditorModal";
import { TemplateGrid } from "./TemplateGrid";
import { TemplatePreview } from "./TemplatePreview";
import { Button } from "./ui/button";
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

export interface CreateDocumentModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDocumentCreated?: (documentId: Id<"documents">) => void;
	defaultFolderId?: Id<"folders">;
	className?: string;
}

const TEMPLATE_CATEGORIES = [
	"all",
	"business",
	"personal",
	"academic",
	"creative",
	"technical",
] as const;

export const CreateDocumentModal: React.FC<CreateDocumentModalProps> = ({
	open,
	onOpenChange,
	onDocumentCreated,
	defaultFolderId,
	className,
}) => {
	// Consolidated reducer state
	type ModalState = {
		title: string;
		selectedFolderId?: Id<"folders">;
		selectedTemplateId?: Id<"templates">;
		selectedCategory: string;
		searchQuery: string;
		isCreating: boolean;
		previewTemplateId?: Id<"templates">;
		showTemplateEditor: boolean;
		editingTemplateId?: Id<"templates">;
	};

	type ModalAction =
		| { type: "SET_TITLE"; title: string }
		| { type: "SET_FOLDER"; folderId?: Id<"folders"> }
		| { type: "SET_TEMPLATE"; templateId?: Id<"templates"> }
		| { type: "SET_CATEGORY"; category: string }
		| { type: "SET_SEARCH"; query: string }
		| { type: "SET_CREATING"; value: boolean }
		| { type: "SET_PREVIEW_TEMPLATE"; templateId?: Id<"templates"> }
		| { type: "SHOW_TEMPLATE_EDITOR"; templateId?: Id<"templates"> }
		| { type: "HIDE_TEMPLATE_EDITOR" }
		| { type: "RESET_FORM"; defaultFolderId?: Id<"folders"> };

	const initialState: ModalState = {
		title: "",
		selectedFolderId: defaultFolderId,
		selectedTemplateId: undefined,
		selectedCategory: "all",
		searchQuery: "",
		isCreating: false,
		previewTemplateId: undefined,
		showTemplateEditor: false,
		editingTemplateId: undefined,
	};

	const modalReducer = (state: ModalState, action: ModalAction): ModalState => {
		switch (action.type) {
			case "SET_TITLE":
				return { ...state, title: action.title };
			case "SET_FOLDER":
				return { ...state, selectedFolderId: action.folderId };
			case "SET_TEMPLATE":
				return { ...state, selectedTemplateId: action.templateId };
			case "SET_CATEGORY":
				// also clear search when category changes (preserving original behavior)
				return { ...state, selectedCategory: action.category, searchQuery: "" };
			case "SET_SEARCH":
				return { ...state, searchQuery: action.query };
			case "SET_CREATING":
				return { ...state, isCreating: action.value };
			case "SET_PREVIEW_TEMPLATE":
				return { ...state, previewTemplateId: action.templateId };
			case "SHOW_TEMPLATE_EDITOR":
				return {
					...state,
					showTemplateEditor: true,
					editingTemplateId: action.templateId,
				};
			case "HIDE_TEMPLATE_EDITOR":
				return {
					...state,
					showTemplateEditor: false,
					editingTemplateId: undefined,
				};
			case "RESET_FORM":
				return {
					...state,
					title: "",
					selectedTemplateId: undefined,
					selectedFolderId: action.defaultFolderId,
					searchQuery: "",
					selectedCategory: "all",
				};
			default:
				return state;
		}
	};

	const [state, dispatch] = useReducer(modalReducer, initialState);

	const {
		title,
		selectedFolderId,
		selectedTemplateId,
		selectedCategory,
		searchQuery,
		isCreating,
		previewTemplateId,
		showTemplateEditor,
		editingTemplateId,
	} = state;

	// Queries
	const templates = useQuery(api.templates.getTemplates, {
		category: selectedCategory === "all" ? undefined : selectedCategory,
		includeTeamTemplates: true,
	});

	const folders = useQuery(api.folders.getFolderTree);

	// Mutations
	const createDocument = useMutation(api.documents.createDocument);
	const createDocumentFromTemplate = useMutation(
		api.templates.createDocumentFromTemplate,
	);

	// Filter templates by search query
	const filteredTemplates = useMemo(() => {
		if (!templates) return [];
		if (!searchQuery.trim()) return templates;

		const query = searchQuery.toLowerCase();
		return templates.filter(
			(template) =>
				template.name.toLowerCase().includes(query) ||
				template.description?.toLowerCase().includes(query) ||
				template.category.toLowerCase().includes(query),
		);
	}, [templates, searchQuery]);

	// Handle document creation
	const handleCreateDocument = useCallback(async () => {
		if (!title.trim()) return;

		dispatch({ type: "SET_CREATING", value: true });
		try {
			let documentId: Id<"documents">;

			if (selectedTemplateId) {
				// Create from template
				documentId = await createDocumentFromTemplate({
					templateId: selectedTemplateId,
					title: title.trim(),
					folderId: selectedFolderId,
				});
			} else {
				// Create blank document (assign folder if selected for consistency)
				documentId = await createDocument({
					title: title.trim(),
					content: JSON.stringify([
						{ type: "paragraph", children: [{ text: "" }] },
					]),
					isPublic: false,
					folderId: selectedFolderId,
				});
			}

			// Reset form
			dispatch({ type: "RESET_FORM", defaultFolderId });

			// Close modal and notify parent
			onOpenChange(false);
			onDocumentCreated?.(documentId);
		} catch (error) {
			console.error("Failed to create document:", error);
		} finally {
			dispatch({ type: "SET_CREATING", value: false });
		}
	}, [
		title,
		selectedTemplateId,
		selectedFolderId,
		defaultFolderId,
		createDocument,
		createDocumentFromTemplate,
		onOpenChange,
		onDocumentCreated,
	]);

	// Handle template selection
	const handleTemplateSelect = useCallback((templateId?: Id<"templates">) => {
		dispatch({ type: "SET_TEMPLATE", templateId });
	}, []);

	// Handle template preview
	const handleTemplatePreview = useCallback((templateId: Id<"templates">) => {
		dispatch({ type: "SET_PREVIEW_TEMPLATE", templateId });
	}, []);

	// Handle using template from preview
	const handleUseTemplate = useCallback((templateId: Id<"templates">) => {
		dispatch({ type: "SET_TEMPLATE", templateId });
		dispatch({ type: "SET_PREVIEW_TEMPLATE", templateId: undefined });
	}, []);

	// Handle template creation
	const handleCreateTemplate = useCallback(() => {
		dispatch({ type: "SHOW_TEMPLATE_EDITOR", templateId: undefined });
	}, []);

	// Handle template editing
	const handleEditTemplate = useCallback((templateId: Id<"templates">) => {
		dispatch({ type: "SHOW_TEMPLATE_EDITOR", templateId });
		dispatch({ type: "SET_PREVIEW_TEMPLATE", templateId: undefined });
	}, []);

	// Handle template editor close
	const handleTemplateEditorClose = useCallback(() => {
		dispatch({ type: "HIDE_TEMPLATE_EDITOR" });
	}, []);

	// Handle template created/updated
	const handleTemplateCreatedOrUpdated = useCallback(() => {
		// Refresh templates list by invalidating the query
		// The useQuery hook will automatically refetch
		dispatch({ type: "HIDE_TEMPLATE_EDITOR" });
	}, []);

	// Handle category change
	const handleCategoryChange = useCallback((category: string) => {
		dispatch({ type: "SET_CATEGORY", category });
	}, []);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={cn("max-w-4xl max-h-[80vh]", className)}>
				<DialogHeader>
					<DialogTitle>Create New Document</DialogTitle>
					<DialogDescription>
						Choose a template or start with a blank document
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-6 overflow-hidden">
					{/* Document Title */}
					<div className="space-y-2">
						<Label htmlFor="document-title">Document Title</Label>
						<Input
							id="document-title"
							placeholder="Enter document title..."
							value={title}
							onChange={(e) =>
								dispatch({ type: "SET_TITLE", title: e.target.value })
							}
							className="w-full"
						/>
					</div>

					{/* Folder Selection */}
					<div className="space-y-2">
						<Label htmlFor="folder-select">Folder (Optional)</Label>
						<Select
							value={selectedFolderId || "none"}
							onValueChange={(value) =>
								dispatch({
									type: "SET_FOLDER",
									folderId:
										value === "none" ? undefined : (value as Id<"folders">),
								})
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a folder..." />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">
									<div className="flex items-center gap-2">
										<FileText className="h-4 w-4" />
										No folder (Root)
									</div>
								</SelectItem>
								{folders?.map((folder) => (
									<SelectItem key={folder._id} value={folder._id}>
										<div className="flex items-center gap-2">
											<FolderOpen className="h-4 w-4" />
											{folder.name}
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Template Selection */}
					<div className="flex-1 flex flex-col gap-4 min-h-0">
						<div className="flex items-center justify-between">
							<Label>Choose Template</Label>
							<div className="flex items-center gap-2">
								{/* Category Filter */}
								<Select
									value={selectedCategory}
									onValueChange={handleCategoryChange}
								>
									<SelectTrigger className="w-32">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TEMPLATE_CATEGORIES.map((category) => (
											<SelectItem key={category} value={category}>
												{category.charAt(0).toUpperCase() + category.slice(1)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								{/* Search */}
								<div className="relative">
									<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder="Search templates..."
										value={searchQuery}
										onChange={(e) =>
											dispatch({ type: "SET_SEARCH", query: e.target.value })
										}
										className="pl-10 w-48"
									/>
								</div>
							</div>
						</div>

						{/* Template Grid */}
						<div className="flex-1 overflow-y-auto">
							<TemplateGrid
								templates={filteredTemplates}
								selectedTemplateId={selectedTemplateId}
								onTemplateSelect={handleTemplateSelect}
								onTemplatePreview={handleTemplatePreview}
								onCreateTemplate={handleCreateTemplate}
								showBlankOption={true}
								showCreateOption={true}
								isLoading={templates === undefined}
							/>
						</div>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-end gap-3 pt-4 border-t">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleCreateDocument}
							disabled={!title.trim() || isCreating}
							className="min-w-24"
						>
							{isCreating ? "Creating..." : "Create Document"}
						</Button>
					</div>
				</div>

				{/* Template Preview Modal */}
				<TemplatePreview
					templateId={previewTemplateId}
					open={!!previewTemplateId}
					onOpenChange={(open) =>
						!open &&
						dispatch({ type: "SET_PREVIEW_TEMPLATE", templateId: undefined })
					}
					onUseTemplate={handleUseTemplate}
					onEditTemplate={handleEditTemplate}
				/>

				{/* Template Editor Modal */}
				<TemplateEditorModal
					open={showTemplateEditor}
					onOpenChange={handleTemplateEditorClose}
					templateId={editingTemplateId}
					onTemplateCreated={handleTemplateCreatedOrUpdated}
					onTemplateUpdated={handleTemplateCreatedOrUpdated}
				/>
			</DialogContent>
		</Dialog>
	);
};
