import {AlertCircle, CheckCircle, Clock, RotateCw, Wifi, WifiOff,} from "lucide-react";
import type React from "react";
import {Badge} from "@/components/ui/badge";
import {Separator} from "@/components/ui/separator";

interface EditorStatusBarProps {
	wordCount?: number;
	characterCount?: number;
	isModified?: boolean;
	lastSaved?: Date;
	syncStatus?: "synced" | "syncing" | "error" | "offline";
	currentLine?: number;
	currentColumn?: number;
	selectedText?: string;
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
	wordCount = 0,
	characterCount = 0,
	isModified = false,
	lastSaved,
	syncStatus = "synced",
	currentLine = 1,
	currentColumn = 1,
	selectedText,
}) => {
	const formatLastSaved = (date?: Date) => {
		if (!date) return "Never";

		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMinutes = Math.floor(diffMs / (1000 * 60));

		if (diffMinutes < 1) return "Just now";
		if (diffMinutes < 60) return `${diffMinutes}m ago`;

		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		return date.toLocaleDateString();
	};

	const getSyncStatusIcon = () => {
		switch (syncStatus) {
			case "synced":
				return <CheckCircle className="h-3 w-3 text-green-600" />;
			case "syncing":
				return <RotateCw className="h-3 w-3 text-blue-600 animate-spin" />;
			case "error":
				return <AlertCircle className="h-3 w-3 text-red-600" />;
			case "offline":
				return <WifiOff className="h-3 w-3 text-yellow-600" />;
			default:
				return <Wifi className="h-3 w-3 text-gray-600" />;
		}
	};

	const getSyncStatusText = () => {
		switch (syncStatus) {
			case "synced":
				return "Synced";
			case "syncing":
				return "Syncing...";
			case "error":
				return "Sync Error";
			case "offline":
				return "Offline";
			default:
				return "Unknown";
		}
	};

	const getSyncStatusColor = () => {
		switch (syncStatus) {
			case "synced":
				return "bg-green-100 text-green-800 border-green-200";
			case "syncing":
				return "bg-blue-100 text-blue-800 border-blue-200";
			case "error":
				return "bg-red-100 text-red-800 border-red-200";
			case "offline":
				return "bg-yellow-100 text-yellow-800 border-yellow-200";
			default:
				return "bg-gray-100 text-gray-800 border-gray-200";
		}
	};

	return (
		<div className="flex items-center justify-between px-4 py-1 bg-background text-xs text-muted-foreground border-t">
			{/* Left side - Document stats */}
			<div className="flex items-center gap-2 sm:gap-4">
				{/* Word and character count */}
				<div className="flex items-center gap-1 sm:gap-2">
					<span className="hidden sm:inline">Words: </span>
					<span className="sm:hidden">W: </span>
					<span>{wordCount.toLocaleString()}</span>
					<Separator orientation="vertical" className="h-3" />
					<span className="hidden sm:inline">Characters: </span>
					<span className="sm:hidden">C: </span>
					<span>{characterCount.toLocaleString()}</span>
				</div>

				{/* Selection info - Hidden on small screens */}
				{selectedText && (
					<div className="hidden md:flex items-center">
						<Separator orientation="vertical" className="h-3" />
						<span>Selected: {selectedText.length} chars</span>
					</div>
				)}

				{/* Cursor position - Hidden on small screens */}
				<div className="hidden lg:flex items-center">
					<Separator orientation="vertical" className="h-3" />
					<span>
						Ln {currentLine}, Col {currentColumn}
					</span>
				</div>
			</div>

			{/* Right side - Save status and sync */}
			<div className="flex items-center gap-2 sm:gap-4">
				{/* Modified indicator */}
				{isModified && (
					<div className="flex items-center gap-1">
						<div className="w-2 h-2 bg-orange-500 rounded-full" />
						<span className="hidden sm:inline">Unsaved changes</span>
						<span className="sm:hidden">Unsaved</span>
					</div>
				)}

				{/* Last saved - Hidden on small screens */}
				<div className="hidden md:flex items-center gap-1">
					<Clock className="h-3 w-3" />
					<span>Saved: {formatLastSaved(lastSaved)}</span>
				</div>

				<Separator orientation="vertical" className="h-3 hidden md:block" />

				{/* Sync status */}
				<div className="flex items-center gap-1 sm:gap-2">
					<div className="flex items-center gap-1">
						{getSyncStatusIcon()}
						<span className="hidden sm:inline">{getSyncStatusText()}</span>
					</div>

					<Badge
						variant="outline"
						className={`text-xs px-1 sm:px-2 py-0 ${getSyncStatusColor()}`}
					>
						<span className="hidden sm:inline">{syncStatus.toUpperCase()}</span>
						<span className="sm:hidden">
							{syncStatus.charAt(0).toUpperCase()}
						</span>
					</Badge>
				</div>
			</div>
		</div>
	);
};

export default EditorStatusBar;
