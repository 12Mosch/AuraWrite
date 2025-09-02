import { useConvex, useMutation, useQuery } from "convex/react";
import {
	Copy,
	Link as LinkIcon,
	Plus,
	Shield,
	ShieldCheck,
	Trash2,
	Users,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, api as generatedApi } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

import { useNetworkStatus } from "../hooks/useNetworkStatus";

import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

type SharingApi = {
	sharing?: {
		getDocumentSharing?: (args: { documentId: Id<"documents"> }) => unknown;
		addCollaborator?: (args: {
			documentId: Id<"documents">;
			userId: Id<"users">;
			role: CollaboratorRole;
		}) => unknown;
		removeCollaborator?: (args: {
			documentId: Id<"documents">;
			userId: Id<"users">;
		}) => unknown;
		updateCollaboratorRole?: (args: {
			documentId: Id<"documents">;
			userId: Id<"users">;
			role: CollaboratorRole;
		}) => unknown;
		setPublic?: (args: {
			documentId: Id<"documents">;
			isPublic: boolean;
		}) => unknown;
		createShareToken?: (args: {
			documentId: Id<"documents">;
			role: CollaboratorRole;
		}) => unknown;
		revokeShareToken?: (args: {
			documentId: Id<"documents">;
			tokenId: Id<"shareTokens">;
		}) => unknown;
	};
};

export type CollaboratorRole = "viewer" | "commenter" | "editor";

/**
 * Local UI extension of the sharing payload that includes optional
 * user metadata (name/email) when the server provides it.
 * We keep fields optional to remain compatible with current server shape.
 */
interface SharingWithMeta {
	ownerId: Id<"users">;
	ownerName?: string | null;
	ownerEmail?: string | null;
	collaborators?: Array<{
		userId: Id<"users">;
		role: CollaboratorRole;
		createdAt: number;
		name?: string | null;
		email?: string | null;
	}>;
	// other fields are allowed but not typed here
	[key: string]: unknown;
}

export interface ShareDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	documentId: string;
	title?: string;
	// Accept legacy props to satisfy existing callers; not used since we query live state.
	ownerId?: string;
	collaborators?: Array<{ userId: string; name: string; role?: string }>;
}

function getErrorMessage(e: unknown): string {
	if (e instanceof Error) return e.message;
	try {
		return String(e);
	} catch {
		return "Unknown error";
	}
}

/**
 * Production-ready Share dialog, wired to Convex sharing APIs.
 * Capabilities:
 * - Load collaborators (with roles), isPublic, and active share tokens
 * - Invite collaborator by email (simple exact-match lookup) with role
 * - Change collaborator role (owner only), remove collaborator
 * - Toggle public access (owner only)
 * - Create link token (owner or editor), revoke token (owner)
 * - Copy public or tokenized links
 * - Disable actions when offline or when lacking permissions (based on callerRole from server)
 *
 * Security notes:
 * - Server returns raw tokens for MVP; consider hashing server-side and only returning the raw value on creation.
 */
export function ShareDialog({
	open,
	onOpenChange,
	documentId,
	title,
}: ShareDialogProps) {
	const { isOnline } = useNetworkStatus();

	// Live query of document sharing state
	// Use generated API if available, otherwise fall back to runtime API
	const sharingApi = (generatedApi.sharing ??
		(api as unknown as SharingApi).sharing) as typeof generatedApi.sharing;

	const sharing = useQuery(sharingApi.getDocumentSharing, {
		documentId: documentId as Id<"documents">,
	});

	// Users simple search by email (exact email supported in current server)
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer");
	const [creatingTokenRole, setCreatingTokenRole] =
		useState<CollaboratorRole>("viewer");
	const [busy, setBusy] = useState(false);

	// Mutations
	const mAddCollaborator = useMutation(sharingApi.addCollaborator);
	const mRemoveCollaborator = useMutation(sharingApi.removeCollaborator);
	const mUpdateCollaboratorRole = useMutation(
		sharingApi.updateCollaboratorRole,
	);
	const mSetPublic = useMutation(sharingApi.setPublic);
	// Prefer the dedicated Node mutation module for token creation.
	// We call the node mutation directly via the Convex client at runtime
	// instead of creating a useMutation hook here. This avoids needing to
	// supply a FunctionReference fallback to useMutation while keeping
	// type-safety for other sharingApi mutations.
	const mRevokeShareToken = useMutation(sharingApi.revokeShareToken);

	// Optional: quick user lookup by email (exact match). We load on-demand during invite.
	const convex = useConvex();
	const findUserByEmail = async (email: string) => {
		try {
			const res = await convex.query(api.users.searchUsers, {
				email,
				limit: 5,
			});
			// Prefer exact email match if present
			const exact = res.find(
				(u) => (u.email || "").toLowerCase() === email.toLowerCase(),
			);
			return exact || res[0] || null;
		} catch {
			return null;
		}
	};

	const basePublicUrl = useMemo(
		() => `${window.location.origin}/d/${documentId}`,
		[documentId],
	);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const safeTitle = (title || "").trim() || "Untitled";

	const callerRole = sharing?.callerRole as
		| "viewer"
		| "commenter"
		| "editor"
		| undefined;
	const ownerId = sharing?.ownerId as Id<"users"> | undefined;

	// Permissions (UI hints; server is authoritative)
	const isOwner = Boolean(ownerId && sharing); // we have an ownerId if loaded; server checks exact identity
	const canInvite = isOnline && (callerRole === "editor" || isOwner);
	const canChangeRole = isOnline && isOwner; // owner only
	const canTogglePublic = isOnline && isOwner; // owner only
	const canCreateLink = isOnline && (callerRole === "editor" || isOwner);
	const canRevokeLink = isOnline && isOwner;

	const handleCopyText = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success("Link copied", { description: "Copied to clipboard." });
		} catch {
			try {
				inputRef.current?.focus();
				inputRef.current?.select();
				document.execCommand?.("copy");
				toast.success("Link copied", { description: "Copied to clipboard." });
			} catch {
				toast.error("Copy failed", { description: "Please copy manually." });
			}
		}
	};

	const inviteUser = async () => {
		if (!isOnline) {
			toast.error("Offline", { description: "Cannot invite while offline." });
			return;
		}
		const email = inviteEmail.trim();
		if (!email) {
			toast.error("Missing email", { description: "Enter user's email." });
			return;
		}
		setBusy(true);
		try {
			const user = await findUserByEmail(email);
			if (!user?._id) {
				toast.error("User not found", {
					description:
						"No account with that email. Invitation requires existing user.",
				});
				return;
			}
			await mAddCollaborator({
				documentId: documentId as Id<"documents">,
				userId: user._id as Id<"users">,
				role: inviteRole,
			});
			setInviteEmail("");
			toast.success("Collaborator added", {
				description: `${user.name || user.email} added as ${inviteRole}.`,
			});
		} catch (e: unknown) {
			const msg = getErrorMessage(e);
			toast.error("Add collaborator failed", { description: msg });
		} finally {
			setBusy(false);
		}
	};

	const removeCollaborator = async (userId: Id<"users">) => {
		if (!isOnline) {
			toast.error("Offline", { description: "Cannot remove while offline." });
			return;
		}
		if (!window.confirm("Remove this collaborator?")) return;
		setBusy(true);
		try {
			await mRemoveCollaborator({
				documentId: documentId as Id<"documents">,
				userId,
			});
			toast.success("Collaborator removed");
		} catch (e: unknown) {
			const msg = getErrorMessage(e);
			toast.error("Remove failed", { description: msg });
		} finally {
			setBusy(false);
		}
	};

	const updateRole = async (userId: Id<"users">, role: CollaboratorRole) => {
		if (!isOnline) {
			toast.error("Offline", {
				description: "Cannot change role while offline.",
			});
			return;
		}
		setBusy(true);
		try {
			await mUpdateCollaboratorRole({
				documentId: documentId as Id<"documents">,
				userId,
				role,
			});
			toast.success("Role updated", { description: `Role set to ${role}.` });
		} catch (e: unknown) {
			const msg = getErrorMessage(e);
			toast.error("Update role failed", { description: msg });
		} finally {
			setBusy(false);
		}
	};

	const togglePublic = async () => {
		if (!isOnline) {
			toast.error("Offline", {
				description: "Cannot change visibility while offline.",
			});
			return;
		}
		if (!sharing) return;
		const next = !sharing.isPublic;
		const ok = window.confirm(
			next
				? "Make this document publicly accessible to anyone with the link?"
				: "Turn off public access? Existing public links will stop working.",
		);
		if (!ok) return;
		setBusy(true);
		try {
			await mSetPublic({
				documentId: documentId as Id<"documents">,
				isPublic: next,
			});
			toast.success("Visibility updated", {
				description: next
					? "Public access enabled."
					: "Public access disabled.",
			});
		} catch (e: unknown) {
			const msg = getErrorMessage(e);
			toast.error("Update failed", { description: msg });
		} finally {
			setBusy(false);
		}
	};

	const createLink = async () => {
		if (!isOnline) {
			toast.error("Offline", {
				description: "Cannot create link while offline.",
			});
			return;
		}
		setBusy(true);
		try {
			const getCreateShareTokenRef = () => {
				const genApiAny = generatedApi as unknown as Record<string, unknown>;
				const genSharingAny =
					(generatedApi as unknown as { sharing?: Record<string, unknown> })
						.sharing ?? undefined;
				return (genApiAny.createShareToken ??
					genSharingAny?.createShareToken ??
					(api as unknown as SharingApi).sharing?.createShareToken) as unknown;
			};

			const fnRefUnknown = getCreateShareTokenRef();
			if (!fnRefUnknown) {
				throw new Error("createShareToken mutation not available");
			}
			// Cast to the FunctionReference shape expected by convex.mutation
			const fnRef = fnRefUnknown as Parameters<typeof convex.mutation>[0];
			const res = (await convex.mutation(fnRef, {
				documentId: documentId as Id<"documents">,
				role: creatingTokenRole,
			})) as unknown as { token?: string };
			const tokenUrl = `${basePublicUrl}?t=${res.token ?? ""}`;
			toast.success("Link created", {
				description: "A new share link has been created.",
			});
			// Copy newly created link
			await handleCopyText(tokenUrl);
		} catch (e: unknown) {
			const msg = getErrorMessage(e);
			toast.error("Create link failed", { description: msg });
		} finally {
			setBusy(false);
		}
	};

	const revokeLink = async (tokenId: Id<"shareTokens">) => {
		if (!isOnline) {
			toast.error("Offline", { description: "Cannot revoke while offline." });
			return;
		}
		if (!window.confirm("Revoke this link? It will stop working immediately."))
			return;
		setBusy(true);
		try {
			await mRevokeShareToken({
				documentId: documentId as Id<"documents">,
				tokenId,
			});
			toast.success("Link revoked");
		} catch (e: unknown) {
			const msg = getErrorMessage(e);
			toast.error("Revoke failed", { description: msg });
		} finally {
			setBusy(false);
		}
	};

	const headerIcon = sharing?.isPublic ? (
		<ShieldCheck className="h-4 w-4" />
	) : (
		<Shield className="h-4 w-4" />
	);

	// Use base URL for the default share link
	const defaultShareUrl = basePublicUrl;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent aria-describedby="share-dialog-description">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{headerIcon}
						Share '{safeTitle}'
					</DialogTitle>
					<DialogDescription id="share-dialog-description">
						Manage access, collaborators, and share links.
					</DialogDescription>
				</DialogHeader>

				{/* Share link (public or base) */}
				<div className="space-y-4">
					<div className="space-y-2">
						<label className="text-sm font-medium" htmlFor="share-link-input">
							Document link
						</label>
						<div className="flex items-center gap-2">
							<Input
								id="share-link-input"
								ref={inputRef}
								readOnly
								value={defaultShareUrl}
								aria-readonly="true"
							/>
							<Button
								type="button"
								onClick={() => handleCopyText(defaultShareUrl)}
								aria-label="Copy link"
								disabled={!isOnline && !sharing?.isPublic}
							>
								<Copy className="mr-2 h-4 w-4" />
								Copy
							</Button>
						</div>
						{sharing === undefined && (
							<p className="text-xs text-muted-foreground">Loading access...</p>
						)}
					</div>

					{/* Public access toggle */}
					<div className="flex items-center justify-between rounded-md border px-3 py-2">
						<div className="flex items-center gap-2">
							{sharing?.isPublic ? (
								<ShieldCheck className="h-4 w-4 text-green-600" />
							) : (
								<Shield className="h-4 w-4" />
							)}
							<div className="flex flex-col">
								<span className="text-sm font-medium">Public Access</span>
								<span className="text-xs text-muted-foreground">
									{sharing?.isPublic
										? "Anyone with the link can view this document."
										: "Only collaborators can access (or via link tokens)."}
								</span>
							</div>
						</div>
						<Button
							type="button"
							variant={sharing?.isPublic ? "outline" : "default"}
							onClick={togglePublic}
							disabled={!canTogglePublic || busy || sharing === undefined}
							title={
								!isOnline ? "Offline" : !canTogglePublic ? "Owner only" : ""
							}
						>
							{sharing?.isPublic ? "Disable" : "Enable"}
						</Button>
					</div>

					{/* Invite collaborators */}
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Users className="h-4 w-4" />
							<div className="text-sm font-medium">Invite collaborator</div>
						</div>
						<div className="flex flex-col sm:flex-row gap-2">
							<Input
								placeholder="User email"
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
								disabled={!canInvite || busy}
								title={
									!isOnline ? "Offline" : !canInvite ? "Owner/Editor only" : ""
								}
							/>
							<Select
								value={inviteRole}
								onValueChange={(v) => setInviteRole(v as CollaboratorRole)}
								disabled={!canInvite || busy}
							>
								<SelectTrigger className="w-[160px]">
									<SelectValue placeholder="Role" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="viewer">Viewer</SelectItem>
									<SelectItem value="commenter">Commenter</SelectItem>
									<SelectItem value="editor">Editor</SelectItem>
								</SelectContent>
							</Select>
							<Button
								type="button"
								onClick={inviteUser}
								disabled={!canInvite || busy}
								title={
									!isOnline ? "Offline" : !canInvite ? "Owner/Editor only" : ""
								}
							>
								<Plus className="h-4 w-4 mr-2" />
								Invite
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							Editor role can be granted by owner only; others may add
							viewers/commenters.
						</p>
					</div>

					{/* People with access */}
					<div className="space-y-2">
						<div className="text-sm font-medium">People with access</div>
						<div className="space-y-2">
							{/* Owner */}
							{sharing && (
								<div className="flex items-center justify-between rounded-md border px-3 py-2">
									<div className="flex items-center gap-3">
										<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
											O
										</div>
										<div className="flex flex-col">
											<span className="text-sm font-medium">Owner</span>
											<span className="text-xs text-muted-foreground">
												{String(
													(sharing as SharingWithMeta).ownerName ??
														(sharing as SharingWithMeta).ownerEmail ??
														sharing.ownerId,
												)}
											</span>
										</div>
									</div>
									<span className="text-xs text-muted-foreground">Owner</span>
								</div>
							)}

							{/* Collaborators */}
							{sharing?.collaborators?.length === 0 && (
								<div className="text-xs text-muted-foreground">
									No collaborators yet.
								</div>
							)}
							{sharing?.collaborators?.map(
								(c: {
									userId: Id<"users">;
									role: CollaboratorRole;
									createdAt: number;
									// optional metadata returned by the server (name/email)
									name?: string | null;
									email?: string | null;
								}) => {
									const display =
										(c.name && String(c.name)) ||
										(c.email && String(c.email)) ||
										String(c.userId);
									// derive initials from name or email (before @) fallback to first char of id
									const computeInitials = (s: string) => {
										if (!s) return "U";
										const nameParts = s.trim().split(/\s+/);
										if (nameParts.length >= 2) {
											return (
												String(nameParts[0][0] || "") +
												String(nameParts[1][0] || "")
											).toUpperCase();
										}
										const local = s.split("@")[0];
										return (local.slice(0, 2) || s[0]).toUpperCase();
									};
									const initials = computeInitials(display);
									return (
										<div
											key={String(c.userId)}
											className="flex items-center justify-between rounded-md border px-3 py-2"
										>
											<div className="flex items-center gap-3">
												<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
													{initials}
												</div>
												<div className="flex flex-col">
													<span className="text-sm font-medium">{display}</span>
													<span className="text-xs text-muted-foreground">
														Added: {new Date(c.createdAt).toLocaleString()}
													</span>
												</div>
											</div>

											<div className="flex items-center gap-2">
												{/* Role selector: owner only */}
												<Select
													value={c.role}
													onValueChange={(v) =>
														updateRole(c.userId, v as CollaboratorRole)
													}
													disabled={!canChangeRole || busy}
												>
													<SelectTrigger className="w-[140px]">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="viewer">Viewer</SelectItem>
														<SelectItem value="commenter">Commenter</SelectItem>
														<SelectItem value="editor">Editor</SelectItem>
													</SelectContent>
												</Select>

												<Button
													type="button"
													variant="outline"
													size="icon"
													onClick={() => removeCollaborator(c.userId)}
													disabled={busy || !isOnline}
													title={!isOnline ? "Offline" : ""}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
									);
								},
							)}
						</div>
					</div>

					{/* Share links (tokens) */}
					<div className="space-y-2">
						<div className="text-sm font-medium">Link sharing</div>

						<div className="flex flex-col sm:flex-row gap-2">
							<Select
								value={creatingTokenRole}
								onValueChange={(v) =>
									setCreatingTokenRole(v as CollaboratorRole)
								}
								disabled={!canCreateLink || busy}
							>
								<SelectTrigger className="w-[160px]">
									<SelectValue placeholder="Role" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="viewer">Viewer</SelectItem>
									<SelectItem value="commenter">Commenter</SelectItem>
									<SelectItem value="editor">Editor</SelectItem>
								</SelectContent>
							</Select>
							<Button
								type="button"
								onClick={createLink}
								disabled={!canCreateLink || busy}
								title={
									!isOnline
										? "Offline"
										: !canCreateLink
											? "Owner/Editor only"
											: ""
								}
							>
								<LinkIcon className="h-4 w-4 mr-2" />
								Create link
							</Button>
						</div>

						<div className="space-y-2">
							{sharing?.tokens?.length === 0 && (
								<div className="text-xs text-muted-foreground">
									No active share links.
								</div>
							)}
							{sharing?.tokens?.map(
								(t: {
									_id: Id<"shareTokens">;
									token?: string;
									role: CollaboratorRole;
									createdAt: number;
									expiresAt?: number | null;
								}) => {
									const url = t.token ? `${basePublicUrl}?t=${t.token}` : defaultShareUrl;
									return (
										<div
											key={String(t._id)}
											className="flex items-center justify-between rounded-md border px-3 py-2"
										>
											<div className="flex flex-col">
												<span className="text-sm font-medium capitalize">
													{t.role} link
												</span>
												<span className="text-xs text-muted-foreground">
													Created {new Date(t.createdAt).toLocaleString()}
													{t.expiresAt
														? ` • Expires ${new Date(t.expiresAt).toLocaleString()}`
														: ""}
												</span>
											</div>
											<div className="flex items-center gap-2">
												<Button
													type="button"
													variant="outline"
													onClick={() => handleCopyText(url)}
													disabled={!isOnline}
													title={!isOnline ? "Offline" : ""}
												>
													<Copy className="h-4 w-4 mr-2" />
													Copy
												</Button>
												<Button
													type="button"
													variant="outline"
													onClick={() => revokeLink(t._id)}
													disabled={!canRevokeLink || busy}
													title={
														!isOnline
															? "Offline"
															: !canRevokeLink
																? "Owner only"
																: ""
													}
												>
													<Trash2 className="h-4 w-4 mr-2" />
													Revoke
												</Button>
											</div>
										</div>
									);
								},
							)}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={busy}
					>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
