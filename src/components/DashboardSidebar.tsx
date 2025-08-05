import {
	Archive,
	ChevronLeft,
	ChevronRight,
	Clock,
	FileText,
	Home,
	Settings,
	Star,
} from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";
import type { SearchCriteria } from "./AdvancedSearchModal";
import { FolderTree } from "./FolderTree";
import { SavedSearches } from "./SavedSearches";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

export interface DashboardSidebarProps {
	collapsed: boolean;
	onToggle: () => void;
	selectedFolderId?: Id<"folders">;
	onFolderSelect?: (folderId?: Id<"folders">) => void;
	onSavedSearchSelect?: (criteria: SearchCriteria) => void;
	currentSearchCriteria?: SearchCriteria;
	onViewChange?: (
		view: "all" | "favorites" | "recent" | "drafts" | "archived",
	) => void;
	currentView?: string;
	className?: string;
	onSettingsClick?: () => void;
}

interface SidebarItemProps {
	icon: React.ReactNode;
	label: string;
	active?: boolean;
	collapsed?: boolean;
	onClick?: () => void;
	badge?: string | number;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
	icon,
	label,
	active = false,
	collapsed = false,
	onClick,
	badge,
}) => {
	return (
		<Button
			variant={active ? "secondary" : "ghost"}
			className={cn(
				"w-full justify-start h-9 px-3",
				collapsed && "px-2 justify-center",
				active && "bg-secondary",
			)}
			onClick={onClick}
		>
			<span className="h-4 w-4 flex-shrink-0">{icon}</span>
			{!collapsed && (
				<>
					<span className="ml-3 truncate">{label}</span>
					{badge && (
						<span className="ml-auto text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
							{badge}
						</span>
					)}
				</>
			)}
		</Button>
	);
};

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
	collapsed,
	onToggle,
	selectedFolderId,
	onFolderSelect,
	onSavedSearchSelect,
	currentSearchCriteria,
	onViewChange,
	currentView = "all",
	className,
	onSettingsClick,
}) => {
	return (
		<aside
			className={cn(
				"bg-background border-r transition-all duration-300 ease-in-out",
				"flex flex-col h-full",
				collapsed ? "w-16" : "w-64",
				// Desktop: always visible and relative
				"lg:relative lg:translate-x-0",
				// Mobile: fixed overlay when expanded, hidden when collapsed
				collapsed ? "hidden lg:block" : "fixed inset-y-0 left-0 z-40 lg:z-auto",
				className,
			)}
		>
			{/* Sidebar Header */}
			<div className="h-14 flex items-center justify-between px-3 border-b">
				{!collapsed && (
					<span className="font-medium text-sm text-muted-foreground">
						Navigation
					</span>
				)}
				<Button
					variant="ghost"
					size="sm"
					onClick={onToggle}
					className="h-8 w-8 p-0 hidden lg:flex"
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{collapsed ? (
						<ChevronRight className="h-4 w-4" />
					) : (
						<ChevronLeft className="h-4 w-4" />
					)}
				</Button>
			</div>

			{/* Navigation Items */}
			<nav className="flex-1 p-3 space-y-1">
				{/* Main Navigation */}
				<div className="space-y-1">
					<SidebarItem
						icon={<Home className="h-4 w-4" />}
						label="All Documents"
						active={currentView === "all"}
						collapsed={collapsed}
						onClick={() => onViewChange?.("all")}
					/>
					<SidebarItem
						icon={<Star className="h-4 w-4" />}
						label="Favorites"
						active={currentView === "favorites"}
						collapsed={collapsed}
						onClick={() => onViewChange?.("favorites")}
					/>
					<SidebarItem
						icon={<Clock className="h-4 w-4" />}
						label="Recent"
						active={currentView === "recent"}
						collapsed={collapsed}
						onClick={() => onViewChange?.("recent")}
					/>
				</div>

				<Separator className="my-3" />

				{/* Status Filters */}
				<div className="space-y-1">
					{!collapsed && (
						<div className="px-3 py-2">
							<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Status
							</span>
						</div>
					)}
					<SidebarItem
						icon={<FileText className="h-4 w-4" />}
						label="Drafts"
						active={currentView === "drafts"}
						collapsed={collapsed}
						onClick={() => onViewChange?.("drafts")}
					/>
					<SidebarItem
						icon={<Archive className="h-4 w-4" />}
						label="Archived"
						active={currentView === "archived"}
						collapsed={collapsed}
						onClick={() => onViewChange?.("archived")}
					/>
				</div>

				<Separator className="my-3" />

				{/* Saved Searches */}
				{!collapsed && (
					<div className="px-3">
						<SavedSearches
							onSearchSelect={onSavedSearchSelect}
							currentSearchCriteria={currentSearchCriteria}
						/>
					</div>
				)}

				<Separator className="my-3" />

				{/* Folders */}
				<div className="space-y-1">
					{!collapsed && (
						<div className="px-3 py-2">
							<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Folders
							</span>
						</div>
					)}
					{!collapsed && (
						<FolderTree
							selectedFolderId={selectedFolderId}
							onFolderSelect={onFolderSelect}
							showCreateButton={true}
						/>
					)}
				</div>
			</nav>

			{/* Sidebar Footer */}
			<div className="p-3 border-t">
				<SidebarItem
					icon={<Settings className="h-4 w-4" />}
					label="Settings"
					collapsed={collapsed}
					onClick={onSettingsClick}
				/>
			</div>

			{/* Mobile Overlay - only show when sidebar is open on mobile */}
			{!collapsed && (
				<div
					// Ensure overlay covers entire viewport and sits above the sidebar on mobile
					className="fixed inset-0 bg-black/20 lg:hidden z-50"
					onClick={onToggle}
					aria-hidden="true"
				/>
			)}
		</aside>
	);
};
