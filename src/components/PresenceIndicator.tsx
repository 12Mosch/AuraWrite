import type React from "react";
import type { Id } from "../../convex/_generated/dataModel";
import {
	getLastSeenText,
	getUserColor,
	getUserInitials,
	usePresence,
} from "../hooks/usePresence";

/**
 * Props for the PresenceIndicator component
 */
interface PresenceIndicatorProps {
	documentId: Id<"documents">;
	className?: string;
	showNames?: boolean;
	maxVisible?: number;
	size?: "sm" | "md" | "lg";
}

/**
 * Avatar component for individual users
 */
interface UserAvatarProps {
	user: {
		_id: Id<"users">;
		name: string;
		image?: string;
	};
	size: "sm" | "md" | "lg";
	showTooltip?: boolean;
	lastSeen?: number;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
	user,
	size,
	showTooltip = true,
	lastSeen,
}) => {
	const sizeClasses = {
		sm: "w-6 h-6 text-xs",
		md: "w-8 h-8 text-sm",
		lg: "w-10 h-10 text-base",
	};

	const userColor = getUserColor(user._id);
	const initials = getUserInitials(user.name);
	const lastSeenText = lastSeen ? getLastSeenText(lastSeen) : "";

	const avatar = (
		<div
			className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-medium border-2 border-white shadow-sm`}
			style={{ backgroundColor: userColor }}
			title={
				showTooltip
					? `${user.name}${lastSeenText ? ` • ${lastSeenText}` : ""}`
					: undefined
			}
		>
			{user.image ? (
				<img
					src={user.image}
					alt={user.name}
					className="w-full h-full rounded-full object-cover"
				/>
			) : (
				initials
			)}
		</div>
	);

	return avatar;
};

/**
 * Real-time presence indicator component
 *
 * Shows active users in a document with:
 * - User avatars with colors
 * - Names (optional)
 * - Last seen timestamps
 * - Overflow handling for many users
 */
export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
	documentId,
	className = "",
	showNames = false,
	maxVisible = 5,
	size = "md",
}) => {
	const { presence, isLoading, otherUsers } = usePresence(documentId, {
		enabled: true,
		updateInterval: 5000,
		trackCursor: false, // Don't track cursor for presence indicator
		trackSelection: false, // Don't track selection for presence indicator
	});

	if (isLoading) {
		return (
			<div className={`flex items-center space-x-2 ${className}`}>
				<div className="animate-pulse flex space-x-1">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className={`${size === "sm" ? "w-6 h-6" : size === "md" ? "w-8 h-8" : "w-10 h-10"} bg-gray-200 rounded-full`}
						/>
					))}
				</div>
			</div>
		);
	}

	if (!presence || otherUsers.length === 0) {
		return (
			<div className={`flex items-center text-gray-500 text-sm ${className}`}>
				<svg
					className="w-4 h-4 mr-1"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-label="User"
				>
					<title>User</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
					/>
				</svg>
				Only you
			</div>
		);
	}

	const visibleUsers = otherUsers.slice(0, maxVisible);
	const hiddenCount = Math.max(0, otherUsers.length - maxVisible);

	return (
		<div className={`flex items-center space-x-2 ${className}`}>
			{/* User Avatars */}
			<div className="flex -space-x-1">
				{visibleUsers.map((presenceUser) => (
					<UserAvatar
						key={presenceUser.sessionId}
						user={presenceUser.user}
						size={size}
						lastSeen={presenceUser.lastSeen}
					/>
				))}

				{/* Overflow indicator */}
				{hiddenCount > 0 && (
					<div
						className={`${
							size === "sm"
								? "w-6 h-6 text-xs"
								: size === "md"
									? "w-8 h-8 text-sm"
									: "w-10 h-10 text-base"
						} rounded-full bg-gray-400 text-white flex items-center justify-center font-medium border-2 border-white shadow-sm`}
						title={`${hiddenCount} more user${hiddenCount === 1 ? "" : "s"}`}
					>
						+{hiddenCount}
					</div>
				)}
			</div>

			{/* User Names (optional) */}
			{showNames && (
				<div className="flex flex-col text-sm text-gray-600">
					{visibleUsers.length === 1 ? (
						<span>{visibleUsers[0].user.name}</span>
					) : visibleUsers.length === 2 ? (
						<span>
							{visibleUsers[0].user.name} and {visibleUsers[1].user.name}
						</span>
					) : (
						<span>
							{visibleUsers[0].user.name} and {otherUsers.length - 1} other
							{otherUsers.length === 2 ? "" : "s"}
						</span>
					)}
				</div>
			)}

			{/* Active indicator */}
			<div className="flex items-center text-xs text-gray-500">
				<div className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse" />
				{otherUsers.length} active
			</div>
		</div>
	);
};

/**
 * Detailed presence list component for showing all active users
 */
interface PresenceListProps {
	documentId: Id<"documents">;
	className?: string;
}

export const PresenceList: React.FC<PresenceListProps> = ({
	documentId,
	className = "",
}) => {
	const { presence, isLoading, otherUsers, currentUser } =
		usePresence(documentId);

	if (isLoading) {
		return (
			<div className={`space-y-2 ${className}`}>
				{[1, 2, 3].map((i) => (
					<div key={i} className="animate-pulse flex items-center space-x-2">
						<div className="w-8 h-8 bg-gray-200 rounded-full" />
						<div className="h-4 bg-gray-200 rounded w-24" />
					</div>
				))}
			</div>
		);
	}

	if (!presence) {
		return (
			<div className={`text-gray-500 text-sm ${className}`}>
				No presence data available
			</div>
		);
	}

	const allUsers = [...(currentUser ? [currentUser] : []), ...otherUsers];

	return (
		<div className={`space-y-2 ${className}`}>
			<h3 className="text-sm font-medium text-gray-700 mb-3">
				Active Users ({allUsers.length})
			</h3>

			{allUsers.map((presenceUser) => (
				<div
					key={presenceUser.sessionId}
					className="flex items-center space-x-3"
				>
					<UserAvatar
						user={presenceUser.user}
						size="md"
						showTooltip={false}
						lastSeen={presenceUser.lastSeen}
					/>

					<div className="flex-1 min-w-0">
						<div className="flex items-center space-x-2">
							<span className="text-sm font-medium text-gray-900 truncate">
								{presenceUser.user.name}
								{presenceUser.isCurrentUser && (
									<span className="text-xs text-gray-500 ml-1">(You)</span>
								)}
							</span>

							<div className="w-2 h-2 bg-green-400 rounded-full" />
						</div>

						<div className="text-xs text-gray-500">
							{getLastSeenText(presenceUser.lastSeen)}
						</div>
					</div>
				</div>
			))}
		</div>
	);
};
