import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	Bold,
	Code,
	Image,
	Italic,
	Link,
	List,
	ListOrdered,
	Quote,
	Redo,
	Strikethrough,
	Underline,
	Undo,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActiveFormats, ToolbarActionHandler } from "./types";

interface EditorToolbarProps {
	onAction?: ToolbarActionHandler;
	activeFormats?: ActiveFormats;
	currentAlignment?: "left" | "center" | "right" | "justify";
	currentFontSize?: string;
	currentFontFamily?: string;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
	onAction,
	activeFormats = {},
	currentAlignment = "left",
	currentFontSize = "14",
	currentFontFamily = "Inter",
}) => {
	const handleAction: ToolbarActionHandler = (action, data) => {
		onAction?.(action, data);
	};

	// Horizontal overflow detection for gradient masks
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [showLeftMask, setShowLeftMask] = useState(false);
	const [showRightMask, setShowRightMask] = useState(false);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const updateMasks = () => {
			const { scrollLeft, scrollWidth, clientWidth } = el;
			const hasOverflow = scrollWidth > clientWidth + 1; // tolerance
			const atStart = scrollLeft <= 1;
			const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;

			setShowLeftMask(hasOverflow && !atStart);
			setShowRightMask(hasOverflow && !atEnd);
		};

		updateMasks();

		const onScroll = () => updateMasks();
		el.addEventListener("scroll", onScroll, { passive: true });

		const ro = new ResizeObserver(updateMasks);
		ro.observe(el);

		return () => {
			el.removeEventListener("scroll", onScroll);
			ro.disconnect();
		};
	}, []);

	const fontSizes = [
		{ value: "11", label: "11px" },
		{ value: "12", label: "12px" },
		{ value: "14", label: "14px" },
		{ value: "16", label: "16px" },
		{ value: "18", label: "18px" },
		{ value: "24", label: "24px" },
		{ value: "32", label: "32px" },
	];

	const fontFamilies = [
		{ value: "Arial", label: "Arial" },
		{ value: "Times New Roman", label: "Times New Roman" },
		{ value: "Helvetica", label: "Helvetica" },
		{ value: "Georgia", label: "Georgia" },
		{ value: "Verdana", label: "Verdana" },
		{ value: "Courier New", label: "Courier New" },
		{ value: "Inter", label: "Inter" },
	];

	return (
		<TooltipProvider>
			<div
				ref={containerRef}
				className="relative flex items-center gap-1 p-2 bg-background border-b overflow-x-auto scroll-smooth"
			>
				{/* Undo/Redo */}
				<div className="flex items-center gap-1 flex-shrink-0">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleAction("edit.undo")}
							>
								<Undo className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Undo (Ctrl+Z)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleAction("edit.redo")}
							>
								<Redo className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Redo (Ctrl+Y)</TooltipContent>
					</Tooltip>
				</div>

				<Separator orientation="vertical" className="h-6" />

				{/* Font Family - Hidden on small screens */}
				<div className="hidden md:block">
					<Select
						value={currentFontFamily}
						onValueChange={(value) =>
							handleAction("format.fontFamily", { fontFamily: value })
						}
					>
						<SelectTrigger className="w-32 h-8" aria-label="Font family">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{fontFamilies.map((font) => (
								<SelectItem key={font.value} value={font.value}>
									{font.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Font Size - Hidden on small screens */}
				<div className="hidden sm:block">
					<Select
						value={currentFontSize}
						onValueChange={(value) =>
							handleAction("format.fontSize", { fontSize: value })
						}
					>
						<SelectTrigger className="w-20 h-8" aria-label="Font size">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{fontSizes.map((size) => (
								<SelectItem key={size.value} value={size.value}>
									{size.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Separator orientation="vertical" className="h-6" />

				{/* Text Formatting */}
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.bold}
								onPressedChange={() => handleAction("format.bold")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Bold className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Bold (Ctrl+B)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.italic}
								onPressedChange={() => handleAction("format.italic")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Italic className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Italic (Ctrl+I)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.underline}
								onPressedChange={() => handleAction("format.underline")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Underline className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Underline (Ctrl+U)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.strikethrough}
								onPressedChange={() => handleAction("format.strikethrough")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Strikethrough className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Strikethrough (Ctrl+Shift+X)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.code}
								onPressedChange={() => handleAction("format.code")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Code className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Code (Ctrl+`)</TooltipContent>
					</Tooltip>
				</div>

				<Separator orientation="vertical" className="h-6" />

				{/* Text Alignment */}
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={currentAlignment === "left"}
								onPressedChange={() => handleAction("format.alignLeft")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<AlignLeft className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Align Left (Ctrl+Shift+L)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={currentAlignment === "center"}
								onPressedChange={() => handleAction("format.alignCenter")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<AlignCenter className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Align Center (Ctrl+Shift+E)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={currentAlignment === "right"}
								onPressedChange={() => handleAction("format.alignRight")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<AlignRight className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Align Right (Ctrl+Shift+R)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={currentAlignment === "justify"}
								onPressedChange={() => handleAction("format.alignJustify")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<AlignJustify className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Justify (Ctrl+Shift+J)</TooltipContent>
					</Tooltip>
				</div>

				<Separator orientation="vertical" className="h-6" />

				{/* Lists and Blocks */}
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.blockType === "bulleted-list"}
								onPressedChange={() => handleAction("format.bulletList")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<List className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Bullet List (Ctrl+Shift+8)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.blockType === "numbered-list"}
								onPressedChange={() => handleAction("format.numberedList")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<ListOrdered className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Numbered List (Ctrl+Shift+7)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.blockType === "blockquote"}
								onPressedChange={() => handleAction("format.blockquote")}
								size="sm"
								className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
							>
								<Quote className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Quote (Ctrl+Shift+Q)</TooltipContent>
					</Tooltip>
				</div>

				<Separator orientation="vertical" className="h-6" />

				{/* Insert Elements */}
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleAction("insert.link")}
							>
								<Link className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Insert Link (Ctrl+K)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleAction("insert.image")}
							>
								<Image className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Insert Image</TooltipContent>
					</Tooltip>
				</div>
				{/* Gradient masks to hint horizontal scroll on small screens */}
				{showLeftMask && (
					<div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent md:hidden" />
				)}
				{showRightMask && (
					<div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent md:hidden" />
				)}
			</div>
		</TooltipProvider>
	);
};

export default EditorToolbar;
