import {
	CheckCircle2,
	Clock,
	CloudOff,
	Loader2,
	Save,
	Wifi,
	WifiOff,
} from "lucide-react";
import type React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MinimalSyncStatus =
	| "synced"
	| "syncing"
	| "error"
	| "offline"
	| "pending"
	| "disabled";

interface EditorStatusBarProps {
	// Connection and sync
	syncStatus?: MinimalSyncStatus;
	// Whether the document has unsaved changes locally
	isModified?: boolean;
	// Last successful save time
	lastSaved?: Date;
	// Optional className to position it in the header container
	className?: string;
}

/**
 * Format a compact relative timestamp, falling back to date for older times.
 */
function formatLastSaved(date?: Date) {
	if (!date) return "Never";
	const now = Date.now();
	const diff = now - date.getTime();
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;

	if (diff < minute) return "Just now";
	if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
	if (diff < day) return `${Math.floor(diff / hour)}h ago`;
	return date.toLocaleDateString();
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
	syncStatus = "synced",
	isModified = false,
	lastSaved,
	className,
}) => {
	// Normalize sync status to user-facing buckets
	const normalized: "online" | "offline" | "syncing" | "error" | "synced" =
		syncStatus === "disabled" || syncStatus === "pending"
			? "offline"
			: (syncStatus as "online" | "offline" | "syncing" | "error" | "synced");

	const connection = normalized === "offline" ? "offline" : "online";

	const connectionIcon =
		connection === "online" ? (
			<Wifi className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
		) : (
			<WifiOff className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
		);

	const saveState = (() => {
		if (normalized === "syncing")
			return {
				label: "Saving…",
				icon: (
					<Loader2
						className="h-3.5 w-3.5 animate-spin text-blue-600"
						aria-hidden="true"
					/>
				),
			};
		if (normalized === "error")
			return {
				label: "Sync error",
				icon: (
					<CloudOff className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
				),
			};
		if (isModified)
			return {
				label: "Unsaved changes",
				icon: (
					<Save className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
				),
			};
		return {
			label: "Saved",
			icon: (
				<CheckCircle2
					className="h-3.5 w-3.5 text-emerald-600"
					aria-hidden="true"
				/>
			),
		};
	})();

	const dotClass = (() => {
		if (normalized === "syncing") return "bg-blue-500";
		if (normalized === "error") return "bg-red-500";
		if (connection === "offline") return "bg-amber-500";
		if (!isModified) return "bg-emerald-500";
		return "bg-amber-500";
	})();

	const lastSavedLabel = formatLastSaved(lastSaved);

	return (
		<TooltipProvider delayDuration={200}>
			<div
				className={cn(
					"flex items-center gap-3 text-xs text-muted-foreground",
					// compact chip-like container to slot into menu bar header area
					"px-2 py-1 rounded-md bg-muted/40 ring-1 ring-border/50",
					"shadow-sm",
					className,
				)}
			>
				{/* Live region for assistive tech: announce save/sync status updates */}
				<div aria-live="polite" className="sr-only">
					{saveState.label}. {connection === "online" ? "Online" : "Offline"}.
					Last saved: {lastSaved ? lastSaved.toLocaleString() : "Never"}
				</div>
				{/* Subtle animated dot to reflect current health */}
				<div className="relative h-2.5 w-2.5" aria-hidden="true">
					<span className={cn("absolute inset-0 rounded-full", dotClass)} />
					<span
						className={cn(
							"absolute inset-0 rounded-full opacity-30 animate-ping",
							dotClass,
						)}
					/>
				</div>

				{/* Connection */}
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="inline-flex items-center gap-1.5">
							{connectionIcon}
							<span className="hidden sm:inline">
								{connection === "online" ? "Online" : "Offline"}
							</span>
							<span className="sm:hidden">
								{connection === "online" ? "On" : "Off"}
							</span>
						</div>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="text-xs">
						Connection status:{" "}
						{connection === "online"
							? "Online (connected)"
							: "Offline (changes will sync when online)"}
					</TooltipContent>
				</Tooltip>

				{/* Divider */}
				<span className="h-4 w-px bg-border/80" aria-hidden="true" />

				{/* Save state */}
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="inline-flex items-center gap-1.5">
							{saveState.icon}
							<span className="hidden sm:inline">{saveState.label}</span>
							<span className="sm:hidden">
								{normalized === "syncing"
									? "Saving"
									: normalized === "error"
										? "Error"
										: isModified
											? "Unsaved"
											: "Saved"}
							</span>
						</div>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="text-xs">
						{saveState.label}
					</TooltipContent>
				</Tooltip>

				{/* Divider */}
				<span className="h-4 w-px bg-border/80" aria-hidden="true" />

				{/* Last sync */}
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="inline-flex items-center gap-1.5">
							<Clock className="h-3.5 w-3.5" aria-hidden="true" />
							<span className="hidden sm:inline">
								Last sync: {lastSavedLabel}
							</span>
							<span className="sm:hidden">{lastSavedLabel}</span>
						</div>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="text-xs">
						Last successful save:{" "}
						{lastSaved ? lastSaved.toLocaleString() : "Never"}
					</TooltipContent>
				</Tooltip>
			</div>
		</TooltipProvider>
	);
};

export default EditorStatusBar;
