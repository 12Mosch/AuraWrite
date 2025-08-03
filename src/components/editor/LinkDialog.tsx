import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface LinkDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onInsert: (url: string, text?: string) => void;
	initialUrl?: string;
	initialText?: string;
	hasSelection?: boolean;
}

export const LinkDialog: React.FC<LinkDialogProps> = ({
	isOpen,
	onClose,
	onInsert,
	initialUrl = "",
	initialText = "",
	hasSelection = false,
}) => {
	const [url, setUrl] = useState(initialUrl);
	const [text, setText] = useState(initialText);

	// Reset form when dialog opens/closes
	useEffect(() => {
		if (isOpen) {
			setUrl(initialUrl);
			setText(initialText);
		}
	}, [isOpen, initialUrl, initialText]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!url.trim()) {
			return;
		}

		// Add protocol if missing
		let finalUrl = url.trim();
		if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
			finalUrl = `https://${finalUrl}`;
		}

		onInsert(finalUrl, hasSelection ? undefined : text.trim() || finalUrl);
		onClose();
	};

	const handleCancel = () => {
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Insert Link</DialogTitle>
					<DialogDescription>
						{hasSelection
							? "Enter the URL for the selected text."
							: "Enter the URL and display text for the link."}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<label htmlFor="url" className="text-sm font-medium">
								URL
							</label>
							<Input
								id="url"
								type="url"
								placeholder="https://example.com"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								autoFocus
							/>
						</div>
						{!hasSelection && (
							<div className="grid gap-2">
								<label htmlFor="text" className="text-sm font-medium">
									Display Text
								</label>
								<Input
									id="text"
									type="text"
									placeholder="Link text"
									value={text}
									onChange={(e) => setText(e.target.value)}
								/>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button type="submit" disabled={!url.trim()}>
							Insert Link
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

export default LinkDialog;
