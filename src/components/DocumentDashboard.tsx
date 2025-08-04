import { useMutation, useQuery } from "convex/react";
import React, { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import { MainContent } from "./MainContent";

export type ViewMode = "grid" | "list";

export interface DocumentDashboardProps {
	className?: string;
	onDocumentOpen?: (documentId: Id<"documents">) => void;
	onSignOut?: () => void;
	onNewDocument?: () => Promise<void>;
}

export const DocumentDashboard: React.FC<DocumentDashboardProps> = ({
	className,
	onDocumentOpen,
	onSignOut,
	onNewDocument,
}) => {
	// State management
	const [viewMode, setViewMode] = useState<ViewMode>("grid");
	const [searchQuery, setSearchQuery] = useState("");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [selectedDocuments, setSelectedDocuments] = useState<
		Set<Id<"documents">>
	>(new Set());

	// Data fetching
	const userDocuments = useQuery(api.documents.getUserDocuments);
	const createDocument = useMutation(api.documents.createDocument);

	// Filter documents based on search query
	const filteredDocuments = React.useMemo(() => {
		if (!userDocuments) return [];
		if (!searchQuery.trim()) return userDocuments;

		const query = searchQuery.toLowerCase();
		return userDocuments.filter(
			(doc) =>
				doc.title.toLowerCase().includes(query) ||
				doc.content?.toLowerCase().includes(query),
		);
	}, [userDocuments, searchQuery]);

	// Event handlers
	const handleViewToggle = useCallback(() => {
		setViewMode((prev) => (prev === "grid" ? "list" : "grid"));
	}, []);

	const handleSearch = useCallback((query: string) => {
		setSearchQuery(query);
	}, []);

	const handleSidebarToggle = useCallback(() => {
		setSidebarCollapsed((prev) => !prev);
	}, []);

	const handleDocumentSelect = useCallback(
		(documentId: Id<"documents">, selected: boolean) => {
			setSelectedDocuments((prev) => {
				const newSet = new Set(prev);
				if (selected) {
					newSet.add(documentId);
				} else {
					newSet.delete(documentId);
				}
				return newSet;
			});
		},
		[],
	);

	const handleCreateDocument = useCallback(async () => {
		try {
			if (onNewDocument) {
				await onNewDocument();
			} else {
				// Fallback: create document directly
				const newDocumentId = await createDocument({
					title: "Untitled Document",
					content: JSON.stringify([
						{ type: "paragraph", children: [{ text: "" }] },
					]),
					isPublic: false,
				});

				if (onDocumentOpen) {
					onDocumentOpen(newDocumentId);
				}
			}
		} catch (error) {
			console.error("Failed to create document:", error);
		}
	}, [createDocument, onNewDocument, onDocumentOpen]);

	const handleDocumentOpen = useCallback(
		(documentId: Id<"documents">) => {
			if (onDocumentOpen) {
				onDocumentOpen(documentId);
			}
		},
		[onDocumentOpen],
	);

	return (
		<div
			className={cn(
				"h-screen flex flex-col bg-background overflow-hidden",
				className,
			)}
		>
			{/* Header */}
			<DashboardHeader
				searchQuery={searchQuery}
				onSearch={handleSearch}
				viewMode={viewMode}
				onViewToggle={handleViewToggle}
				onCreateDocument={handleCreateDocument}
				onSidebarToggle={handleSidebarToggle}
				sidebarCollapsed={sidebarCollapsed}
				onSignOut={onSignOut}
			/>

			{/* Main Layout */}
			<div className="flex-1 flex overflow-hidden min-h-0">
				{/* Sidebar */}
				<DashboardSidebar
					collapsed={sidebarCollapsed}
					onToggle={handleSidebarToggle}
					className="border-r"
				/>

				{/* Main Content */}
				<MainContent
					documents={filteredDocuments}
					viewMode={viewMode}
					selectedDocuments={selectedDocuments}
					onDocumentOpen={handleDocumentOpen}
					onDocumentSelect={handleDocumentSelect}
					onCreateDocument={handleCreateDocument}
					isLoading={userDocuments === undefined}
					className="flex-1"
				/>
			</div>
		</div>
	);
};
