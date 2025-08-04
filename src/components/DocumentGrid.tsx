import type React from "react";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";
import { DocumentCard } from "./DocumentCard";
import type { Document } from "./MainContent";

export interface DocumentGridProps {
	documents: Document[];
	selectedDocuments: Set<Id<"documents">>;
	onDocumentOpen: (documentId: Id<"documents">) => void;
	onDocumentSelect: (documentId: Id<"documents">, selected: boolean) => void;
	className?: string;
}

export const DocumentGrid: React.FC<DocumentGridProps> = ({
	documents,
	selectedDocuments,
	onDocumentOpen,
	onDocumentSelect,
	className,
}) => {
	if (documents.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted-foreground">
				<p>No documents found</p>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"grid gap-4",
				// Responsive grid columns
				"grid-cols-1", // 1 column on mobile
				"sm:grid-cols-2", // 2 columns on small screens
				"lg:grid-cols-3", // 3 columns on large screens
				"xl:grid-cols-4", // 4 columns on extra large screens
				"2xl:grid-cols-5", // 5 columns on 2xl screens
				className,
			)}
		>
			{documents.map((document) => (
				<DocumentCard
					key={document._id}
					document={document}
					selected={selectedDocuments.has(document._id)}
					onSelect={(selected) => onDocumentSelect(document._id, selected)}
					onOpen={() => onDocumentOpen(document._id)}
					className="h-fit"
				/>
			))}
		</div>
	);
};
