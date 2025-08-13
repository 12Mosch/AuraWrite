import {
	Grid3X3,
	List,
	LogOut,
	Menu,
	Plus,
	Settings,
	User,
	X,
} from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { SearchCriteria } from "./AdvancedSearchModal";
import type { ViewMode } from "./DocumentDashboard";
import { type FilterCriteria, FilterPanel } from "./FilterPanel";
import { SearchBar } from "./SearchBar";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export interface DashboardHeaderProps {
	searchQuery: string;
	onSearch: (query: string) => void;
	onAdvancedSearch?: (criteria: SearchCriteria) => void;
	filters: FilterCriteria;
	onFiltersChange: (filters: FilterCriteria) => void;
	viewMode: ViewMode;
	onViewToggle: () => void;
	onCreateDocument: () => void;
	onSidebarToggle: () => void;
	sidebarCollapsed: boolean;
	onSignOut?: () => void;
	onProfileClick?: () => void;
	onSettingsClick?: () => void;
	className?: string;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
	searchQuery,
	onSearch,
	onAdvancedSearch,
	filters,
	onFiltersChange,
	viewMode,
	onViewToggle,
	onCreateDocument,
	onSidebarToggle,
	sidebarCollapsed,
	onSignOut,
	onProfileClick,
	onSettingsClick,
	className,
}) => {
	return (
		<header
			className={cn(
				"h-14 border-b bg-background",
				"flex items-center gap-4 px-4 flex-shrink-0",
				className,
			)}
		>
			{/* Left Section: Sidebar Toggle + Branding */}
			<div className="flex items-center gap-3">
				<Button
					variant="ghost"
					size="sm"
					onClick={onSidebarToggle}
					className="h-8 w-8 p-0 lg:hidden"
					aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
				>
					{sidebarCollapsed ? (
						<Menu className="h-4 w-4" />
					) : (
						<X className="h-4 w-4" />
					)}
				</Button>

				<div className="flex items-center gap-2">
					<div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
						<span className="text-primary-foreground text-xs font-bold">A</span>
					</div>
					<h1 className="font-semibold text-lg hidden sm:block">AuraWrite</h1>
				</div>
			</div>

			{/* Center Section: Search & Filters */}
			<div className="flex-1 flex items-center gap-2 max-w-2xl mx-4">
				<div className="flex-1 max-w-md">
					<SearchBar
						value={searchQuery}
						onChange={onSearch}
						onSearch={onSearch}
						onAdvancedSearch={onAdvancedSearch}
						placeholder="Search documents..."
						showShortcut={true}
					/>
				</div>
				<FilterPanel
					filters={filters}
					onFiltersChange={onFiltersChange}
					showAsDropdown={true}
				/>
			</div>

			{/* Right Section: Actions + User Menu */}
			<div className="flex items-center gap-2">
				{/* View Toggle */}
				<div className="hidden sm:flex items-center border rounded-md">
					<Button
						variant={viewMode === "grid" ? "default" : "ghost"}
						size="sm"
						onClick={onViewToggle}
						className="h-8 px-3 rounded-r-none border-r"
						aria-label="Grid view"
					>
						<Grid3X3 className="h-4 w-4" />
					</Button>
					<Button
						variant={viewMode === "list" ? "default" : "ghost"}
						size="sm"
						onClick={onViewToggle}
						className="h-8 px-3 rounded-l-none"
						aria-label="List view"
					>
						<List className="h-4 w-4" />
					</Button>
				</div>

				{/* Create Document Button */}
				<Button onClick={onCreateDocument} size="sm" className="h-9 gap-2">
					<Plus className="h-4 w-4" />
					<span className="hidden sm:inline">New Document</span>
				</Button>

				{/* User Menu */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
							<User className="h-4 w-4" />
							<span className="sr-only">User menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem className="sm:hidden" onClick={onViewToggle}>
							{viewMode === "grid" ? (
								<>
									<List className="h-4 w-4 mr-2" />
									List View
								</>
							) : (
								<>
									<Grid3X3 className="h-4 w-4 mr-2" />
									Grid View
								</>
							)}
						</DropdownMenuItem>
						<DropdownMenuSeparator className="sm:hidden" />
						<DropdownMenuItem onClick={onProfileClick}>
							<User className="h-4 w-4 mr-2" />
							Profile
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onSettingsClick}>
							<Settings className="h-4 w-4 mr-2" />
							Settings
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{onSignOut && (
							<DropdownMenuItem onClick={onSignOut}>
								<LogOut className="h-4 w-4 mr-2" />
								Sign Out
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
};
