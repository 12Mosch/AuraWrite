import type React from "react";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";
import type { ViewMode } from "./DocumentDashboard";
import { DocumentGrid } from "./DocumentGrid";
import { DocumentList } from "./DocumentList";
import { EmptyState } from "./EmptyState";

// Document type based on the Convex schema
export interface Document {
	_id: Id<"documents">;
	title: string;
	content?: string;
	yjsState?: ArrayBuffer;
	yjsStateVector?: ArrayBuffer;
	yjsUpdatedAt?: number;
	ownerId: Id<"users">;
	isPublic?: boolean;
	collaborators?: Id<"users">[];
	createdAt: number;
	updatedAt: number;
	tags?: string[];
	status?: "draft" | "published" | "archived";
	folderId?: Id<"folders">;
	templateId?: Id<"templates">;
	lastAccessedAt?: number;
	isFavorite?: boolean;
	_creationTime: number;
}

export interface MainContentProps {
	documents: Document[] | undefined;
	viewMode: ViewMode;
	selectedDocuments: Set<Id<"documents">>;
	onDocumentOpen: (documentId: Id<"documents">) => void;
	onDocumentSelect: (documentId: Id<"documents">, selected: boolean) => void;
	onCreateDocument?: () => void;
	isLoading: boolean;
	className?: string;
}

export const MainContent: React.FC<MainContentProps> = ({
	documents,
	viewMode,
	selectedDocuments,
	onDocumentOpen,
	onDocumentSelect,
	onCreateDocument,
	isLoading,
	className,
}) => {
	// Loading state
	if (isLoading) {
		return (
			<main className={cn("flex-1 flex flex-col min-h-0", className)}>
				<div className="flex-1 overflow-y-auto p-6">
					<div className="flex items-center justify-center h-64">
						<div className="flex items-center gap-2 text-muted-foreground">
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
							<span>Loading documents...</span>
						</div>
					</div>
				</div>
			</main>
		);
	}

	// Empty state
	if (!documents || documents.length === 0) {
		return (
			<main className={cn("flex-1 flex flex-col min-h-0", className)}>
				<div className="flex-1 overflow-y-auto">
					<EmptyState onCreateDocument={onCreateDocument} />
				</div>
			</main>
		);
	}

	// Document display
	return (
		<main className={cn("flex-1 flex flex-col min-h-0", className)}>
			<div className="flex-1 overflow-y-auto p-6">
				{/* Header with document count */}
				<div className="mb-6">
					<h2 className="text-lg font-semibold">Documents</h2>
					<p className="text-sm text-muted-foreground">
						{documents.length}{" "}
						{documents.length === 1 ? "document" : "documents"}
					</p>
				</div>

				{/* Document Display */}
				{viewMode === "grid" ? (
					<DocumentGrid
						documents={documents}
						selectedDocuments={selectedDocuments}
						onDocumentOpen={onDocumentOpen}
						onDocumentSelect={onDocumentSelect}
					/>
				) : (
					<DocumentList
						documents={documents}
						selectedDocuments={selectedDocuments}
						onDocumentOpen={onDocumentOpen}
						onDocumentSelect={onDocumentSelect}
					/>
				)}
			</div>
		</main>
	);
};
