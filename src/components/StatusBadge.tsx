import type React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

export type DocumentStatus = "draft" | "published" | "archived";

export interface StatusBadgeProps {
	status?: DocumentStatus;
	className?: string;
	size?: "sm" | "md" | "lg";
}

const statusConfig = {
	draft: {
		label: "Draft",
		color: "bg-yellow-100 text-yellow-800 border-yellow-200",
		dotColor: "bg-yellow-500",
	},
	published: {
		label: "Published",
		color: "bg-green-100 text-green-800 border-green-200",
		dotColor: "bg-green-500",
	},
	archived: {
		label: "Archived",
		color: "bg-gray-100 text-gray-800 border-gray-200",
		dotColor: "bg-gray-500",
	},
} as const;

export const StatusBadge: React.FC<StatusBadgeProps> = ({
	status = "draft",
	className,
	size = "sm",
}) => {
	const config = statusConfig[status];

	const sizeClasses = {
		sm: "text-xs px-2 py-1 h-5",
		md: "text-sm px-3 py-1 h-6",
		lg: "text-sm px-3 py-1.5 h-8",
	};

	const dotSizeClasses = {
		sm: "h-1.5 w-1.5",
		md: "h-2 w-2",
		lg: "h-2 w-2",
	};

	return (
		<Badge
			variant="outline"
			className={cn(
				config.color,
				sizeClasses[size],
				"font-medium inline-flex items-center gap-1.5",
				className,
			)}
		>
			<div
				className={cn("rounded-full", config.dotColor, dotSizeClasses[size])}
			/>
			{config.label}
		</Badge>
	);
};
