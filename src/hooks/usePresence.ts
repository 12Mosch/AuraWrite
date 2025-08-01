import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * User presence information
 */
export interface PresenceUser {
	sessionId: Id<"collaborationSessions">;
	userId: Id<"users">;
	user: {
		_id: Id<"users">;
		name: string;
		email?: string;
		image?: string;
	};
	cursor?: {
		anchor: { path: number[]; offset: number };
		focus: { path: number[]; offset: number };
	};
	selection?: {
		anchor: { path: number[]; offset: number };
		focus: { path: number[]; offset: number };
	};
	lastSeen: number;
	isCurrentUser: boolean;
}

/**
 * Presence data structure
 */
export interface PresenceData {
	documentId: Id<"documents">;
	activeUsers: PresenceUser[];
	totalActiveUsers: number;
	lastUpdated: number;
}

/**
 * Hook options
 */
export interface UsePresenceOptions {
	/** Whether to enable presence tracking */
	enabled?: boolean;
	/** How often to update presence (in milliseconds) */
	updateInterval?: number;
	/** Whether to track cursor position */
	trackCursor?: boolean;
	/** Whether to track text selection */
	trackSelection?: boolean;
}

/**
 * Hook return type
 */
export interface UsePresenceReturn {
	/** Current presence data */
	presence: PresenceData | undefined;
	/** Whether presence data is loading */
	isLoading: boolean;
	/** Update current user's presence */
	updatePresence: (cursor?: unknown, selection?: unknown) => Promise<void>;
	/** Get other users (excluding current user) */
	otherUsers: PresenceUser[];
	/** Get current user's presence info */
	currentUser: PresenceUser | undefined;
	/** Whether presence tracking is active */
	isActive: boolean;
	/** Any update error that occurred */
	updateError: Error | null;
}

/**
 * Custom hook for real-time user presence in collaborative documents
 *
 * This hook provides:
 * - Real-time updates of active users in a document
 * - Cursor and selection tracking
 * - Automatic presence heartbeat
 * - User filtering (current vs others)
 *
 * @param documentId - The document to track presence for
 * @param options - Configuration options
 * @returns Presence data and control functions
 */
export const usePresence = (
	documentId: Id<"documents"> | null,
	options: UsePresenceOptions = {},
): UsePresenceReturn => {
	const {
		enabled = true,
		updateInterval = 5000, // 5 seconds
		trackCursor = true,
		trackSelection = true,
	} = options;

	// Convex hooks
	const presence = useQuery(
		api.collaboration.subscribeToPresence,
		documentId && enabled ? { documentId } : "skip",
	);
	const updatePresenceMutation = useMutation(api.collaboration.updatePresence);

	// Refs for tracking state
	const intervalRef = useRef<NodeJS.Timeout | null>(null);
	const lastCursorRef = useRef<unknown>(null);
	const lastSelectionRef = useRef<unknown>(null);

	// Update presence function
	const [updateError, setUpdateError] = useState<Error | null>(null);

	const updatePresence = useCallback(
		async (cursor?: unknown, selection?: unknown) => {
			if (!documentId || !enabled) return;

			try {
				setUpdateError(null);
				// Build presence data with proper typing
				const presenceData: {
					documentId: Id<"documents">;
					cursor?: {
						anchor: { path: number[]; offset: number };
						focus: { path: number[]; offset: number };
					};
					selection?: {
						anchor: { path: number[]; offset: number };
						focus: { path: number[]; offset: number };
					};
				} = { documentId };

				if (trackCursor && cursor) {
					presenceData.cursor = cursor as {
						anchor: { path: number[]; offset: number };
						focus: { path: number[]; offset: number };
					};
					lastCursorRef.current = cursor;
				}

				if (trackSelection && selection) {
					presenceData.selection = selection as {
						anchor: { path: number[]; offset: number };
						focus: { path: number[]; offset: number };
					};
					lastSelectionRef.current = selection;
				}

				await updatePresenceMutation(presenceData);
			} catch (error) {
				console.error("Failed to update presence:", error);
				setUpdateError(error as Error);
			}
		},
		[documentId, enabled, trackCursor, trackSelection, updatePresenceMutation],
	);

	// Set up automatic presence heartbeat
	useEffect(() => {
		if (!enabled || !documentId) return;

		// Initial presence update
		updatePresence(lastCursorRef.current, lastSelectionRef.current);

		// Set up interval for heartbeat
		intervalRef.current = setInterval(() => {
			updatePresence(lastCursorRef.current, lastSelectionRef.current);
		}, updateInterval);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [enabled, documentId, updateInterval, updatePresence]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, []);

	// Derived data
	const isLoading = enabled && documentId !== null && presence === undefined;
	const otherUsers =
		presence?.activeUsers.filter((user) => user && !user.isCurrentUser) || [];
	const currentUser = presence?.activeUsers.find((user) => user?.isCurrentUser);
	const isActive = enabled && !!documentId;

	return {
		presence: presence
			? {
					...presence,
					activeUsers: presence.activeUsers.filter(Boolean) as PresenceUser[],
				}
			: undefined,
		isLoading,
		updatePresence,
		otherUsers: otherUsers.filter(Boolean) as PresenceUser[],
		currentUser: currentUser || undefined,
		isActive,
		updateError,
	};
};

/**
 * Utility function to get user initials for avatars
 */
export const getUserInitials = (name: string): string => {
	if (!name || name.trim() === "") return "??";

	const trimmedName = name.trim();
	if (trimmedName.length === 1) return trimmedName.toUpperCase();

	return (
		trimmedName
			.split(" ")
			.filter((part) => part.length > 0)
			.map((part) => part.charAt(0).toUpperCase())
			.slice(0, 2)
			.join("") || "??"
	);
};

/**
 * Utility function to generate a color for a user
 */
export const getUserColor = (userId: string): string => {
	const colors = [
		"#ef4444",
		"#f97316",
		"#eab308",
		"#22c55e",
		"#06b6d4",
		"#3b82f6",
		"#8b5cf6",
		"#ec4899",
	];

	// Simple hash function to get consistent color for user
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = ((hash << 5) - hash + userId.charCodeAt(i)) & 0xffffffff;
	}

	return colors[Math.abs(hash) % colors.length];
};

/**
 * Utility function to format "last seen" time
 */
export const getLastSeenText = (lastSeen: number): string => {
	const now = Date.now();
	const diffMs = now - lastSeen;

	// Handle future timestamps (clock skew)
	if (diffMs < 0) return "Just now";

	const diffSeconds = Math.floor(diffMs / 1000);

	if (diffSeconds < 30) return "Just now";
	if (diffSeconds < 60) return `${diffSeconds}s ago`;

	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) return `${diffMinutes}m ago`;

	const diffHours = Math.floor(diffMinutes / 60);
	return `${diffHours}h ago`;
};
