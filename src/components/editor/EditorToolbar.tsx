import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	ArrowLeft,
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
import { EditorStatusBar, type MinimalSyncStatus } from "./EditorStatusBar";
import type { ActiveFormats, ToolbarActionHandler } from "./types";

interface EditorToolbarProps {
	onAction?: ToolbarActionHandler;
	activeFormats?: ActiveFormats;
	currentAlignment?: "left" | "center" | "right" | "justify";
	currentFontSize?: string;
	currentFontFamily?: string;
	// Status bar props
	showStatusBar?: boolean;
	syncStatus?: MinimalSyncStatus;
	isModified?: boolean;
	lastSaved?: Date;
	// Navigation callback
	onExitToDashboard?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
	onAction,
	activeFormats = {},
	currentAlignment = "left",
	currentFontSize = "14",
	currentFontFamily = "Inter",
	showStatusBar = true,
	syncStatus = "synced",
	isModified = false,
	lastSaved,
	onExitToDashboard,
}) => {
	const handleAction: ToolbarActionHandler = (action, data) => {
		if (action === "navigation.exitToDashboard") {
			onExitToDashboard?.();
		} else {
			onAction?.(action, data);
		}
	};

	// Ensure focused toolbar children are scrolled into view when the toolbar is horizontally
	// scrollable so keyboard users don't lose focus off-screen.
	const handleChildFocus = (e: React.FocusEvent<HTMLElement>) => {
		const target = e.currentTarget;
		// nearest keeps it from moving the container too aggressively
		target.scrollIntoView({
			inline: "nearest",
			block: "nearest",
			behavior: "smooth",
		});
	};

	// Presentational-only: derive booleans from props for consistent visuals/aria
	const isBold = Boolean(activeFormats?.bold);
	const isItalic = Boolean(activeFormats?.italic);
	const isUnderline = Boolean(activeFormats?.underline);
	const isStrikethrough = Boolean(activeFormats?.strikethrough);
	const isCode = Boolean(activeFormats?.code);

	const isAlignLeft = currentAlignment === "left";
	const isAlignCenter = currentAlignment === "center";
	const isAlignRight = currentAlignment === "right";
	const isAlignJustify = currentAlignment === "justify";

	const isBulletList = activeFormats?.blockType === "bulleted-list";
	const isNumberedList = activeFormats?.blockType === "numbered-list";
	const isBlockquote = activeFormats?.blockType === "blockquote";

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
				role="toolbar"
				aria-label="Editor toolbar"
				className="relative flex items-center justify-between gap-1 p-2 bg-background border-b overflow-x-auto scroll-smooth"
			>
				{/* Left side: Toolbar controls */}
				<div className="flex items-center gap-1 flex-1 min-w-0">
					{/* Exit to Dashboard */}
					<div className="flex items-center gap-1 flex-shrink-0">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleAction("navigation.exitToDashboard")}
								>
									<ArrowLeft className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Back to Dashboard</TooltipContent>
						</Tooltip>
					</div>

					<Separator orientation="vertical" className="h-6" />

					{/* Undo/Redo */}
					<div className="flex items-center gap-1 flex-shrink-0">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleAction("edit.undo")}
									aria-label="Undo"
									aria-keyshortcuts="Ctrl+Z Meta+Z"
									title="Undo (Ctrl+Z)"
									onFocus={handleChildFocus}
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
									aria-label="Redo"
									aria-keyshortcuts="Ctrl+Y Meta+Shift+Z"
									title="Redo (Ctrl+Y)"
									onFocus={handleChildFocus}
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
									pressed={isBold}
									onPressedChange={() => handleAction("format.bold")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isBold}
									aria-label="Bold"
									aria-keyshortcuts="Ctrl+B Meta+B"
									title={isBold ? "Bold — active (Ctrl+B)" : "Bold (Ctrl+B)"}
									onFocus={handleChildFocus}
								>
									<Bold
										className={`${isBold ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isBold ? "Bold — active (Ctrl+B)" : "Bold (Ctrl+B)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isItalic}
									onPressedChange={() => handleAction("format.italic")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isItalic}
									aria-label="Italic"
									aria-keyshortcuts="Ctrl+I Meta+I"
									title={
										isItalic ? "Italic — active (Ctrl+I)" : "Italic (Ctrl+I)"
									}
									onFocus={handleChildFocus}
								>
									<Italic
										className={`${isItalic ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isItalic ? "Italic — active (Ctrl+I)" : "Italic (Ctrl+I)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isUnderline}
									onPressedChange={() => handleAction("format.underline")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isUnderline}
									aria-label="Underline"
									aria-keyshortcuts="Ctrl+U Meta+U"
									title={
										isUnderline
											? "Underline — active (Ctrl+U)"
											: "Underline (Ctrl+U)"
									}
									onFocus={handleChildFocus}
								>
									<Underline
										className={`${isUnderline ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isUnderline
									? "Underline — active (Ctrl+U)"
									: "Underline (Ctrl+U)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isStrikethrough}
									onPressedChange={() => handleAction("format.strikethrough")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isStrikethrough}
									aria-label="Strikethrough"
									aria-keyshortcuts="Ctrl+Shift+X Meta+Shift+X"
									title={
										isStrikethrough
											? "Strikethrough — active (Ctrl+Shift+X)"
											: "Strikethrough (Ctrl+Shift+X)"
									}
									onFocus={handleChildFocus}
								>
									<Strikethrough
										className={`${isStrikethrough ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isStrikethrough
									? "Strikethrough — active (Ctrl+Shift+X)"
									: "Strikethrough (Ctrl+Shift+X)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isCode}
									onPressedChange={() => handleAction("format.code")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isCode}
									aria-label="Code"
									aria-keyshortcuts="Ctrl+` Meta+`"
									title={isCode ? "Code — active (Ctrl+`)" : "Code (Ctrl+`)"}
									onFocus={handleChildFocus}
								>
									<Code
										className={`${isCode ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isCode ? "Code — active (Ctrl+`)" : "Code (Ctrl+`)"}
							</TooltipContent>
						</Tooltip>
					</div>

					<Separator orientation="vertical" className="h-6" />

					{/* Text Alignment */}
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isAlignLeft}
									onPressedChange={() => handleAction("format.alignLeft")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isAlignLeft}
									aria-label="Align left"
									aria-keyshortcuts="Ctrl+Shift+L Meta+Shift+L"
									title={
										isAlignLeft
											? "Align Left — active (Ctrl+Shift+L)"
											: "Align Left (Ctrl+Shift+L)"
									}
									onFocus={handleChildFocus}
								>
									<AlignLeft
										className={`${isAlignLeft ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isAlignLeft
									? "Align Left — active (Ctrl+Shift+L)"
									: "Align Left (Ctrl+Shift+L)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isAlignCenter}
									onPressedChange={() => handleAction("format.alignCenter")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isAlignCenter}
									aria-label="Align center"
									aria-keyshortcuts="Ctrl+Shift+E Meta+Shift+E"
									title={
										isAlignCenter
											? "Align Center — active (Ctrl+Shift+E)"
											: "Align Center (Ctrl+Shift+E)"
									}
									onFocus={handleChildFocus}
								>
									<AlignCenter
										className={`${isAlignCenter ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isAlignCenter
									? "Align Center — active (Ctrl+Shift+E)"
									: "Align Center (Ctrl+Shift+E)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isAlignRight}
									onPressedChange={() => handleAction("format.alignRight")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isAlignRight}
									aria-label="Align right"
									aria-keyshortcuts="Ctrl+Shift+R Meta+Shift+R"
									title={
										isAlignRight
											? "Align Right — active (Ctrl+Shift+R)"
											: "Align Right (Ctrl+Shift+R)"
									}
									onFocus={handleChildFocus}
								>
									<AlignRight
										className={`${isAlignRight ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isAlignRight
									? "Align Right — active (Ctrl+Shift+R)"
									: "Align Right (Ctrl+Shift+R)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isAlignJustify}
									onPressedChange={() => handleAction("format.alignJustify")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isAlignJustify}
									aria-label="Justify"
									aria-keyshortcuts="Ctrl+Shift+J Meta+Shift+J"
									title={
										isAlignJustify
											? "Justify — active (Ctrl+Shift+J)"
											: "Justify (Ctrl+Shift+J)"
									}
									onFocus={handleChildFocus}
								>
									<AlignJustify
										className={`${isAlignJustify ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isAlignJustify
									? "Justify — active (Ctrl+Shift+J)"
									: "Justify (Ctrl+Shift+J)"}
							</TooltipContent>
						</Tooltip>
					</div>

					<Separator orientation="vertical" className="h-6" />

					{/* Lists and Blocks */}
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isBulletList}
									onPressedChange={() => handleAction("format.bulletList")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isBulletList}
									aria-label="Bullet list"
									aria-keyshortcuts="Ctrl+Shift+8 Meta+Shift+8"
									title={
										isBulletList
											? "Bullet List — active (Ctrl+Shift+8)"
											: "Bullet List (Ctrl+Shift+8)"
									}
									onFocus={handleChildFocus}
								>
									<List
										className={`${isBulletList ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isBulletList
									? "Bullet List — active (Ctrl+Shift+8)"
									: "Bullet List (Ctrl+Shift+8)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isNumberedList}
									onPressedChange={() => handleAction("format.numberedList")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isNumberedList}
									aria-label="Numbered list"
									aria-keyshortcuts="Ctrl+Shift+7 Meta+Shift+7"
									title={
										isNumberedList
											? "Numbered List — active (Ctrl+Shift+7)"
											: "Numbered List (Ctrl+Shift+7)"
									}
									onFocus={handleChildFocus}
								>
									<ListOrdered
										className={`${isNumberedList ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isNumberedList
									? "Numbered List — active (Ctrl+Shift+7)"
									: "Numbered List (Ctrl+Shift+7)"}
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Toggle
									pressed={isBlockquote}
									onPressedChange={() => handleAction("format.blockquote")}
									size="sm"
									className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
									aria-pressed={isBlockquote}
									aria-label="Quote"
									aria-keyshortcuts="Ctrl+Shift+Q Meta+Shift+Q"
									title={
										isBlockquote
											? "Quote — active (Ctrl+Shift+Q)"
											: "Quote (Ctrl+Shift+Q)"
									}
									onFocus={handleChildFocus}
								>
									<Quote
										className={`${isBlockquote ? "toolbar-icon-active text-accent-foreground" : "text-muted-foreground"} h-4 w-4`}
									/>
								</Toggle>
							</TooltipTrigger>
							<TooltipContent>
								{isBlockquote
									? "Quote — active (Ctrl+Shift+Q)"
									: "Quote (Ctrl+Shift+Q)"}
							</TooltipContent>
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
									aria-label="Insert link"
									aria-keyshortcuts="Ctrl+K Meta+K"
									title="Insert Link (Ctrl+K)"
									onFocus={handleChildFocus}
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
									aria-label="Insert image"
									title="Insert Image"
									onFocus={handleChildFocus}
								>
									<Image className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Insert Image</TooltipContent>
						</Tooltip>
					</div>
				</div>

				{/* Right side: Status bar */}
				{showStatusBar && (
					<div className="flex-shrink-0">
						<EditorStatusBar
							syncStatus={syncStatus}
							isModified={isModified}
							lastSaved={lastSaved}
						/>
					</div>
				)}

				{/* Gradient masks to hint horizontal scroll on small screens */}
				{showLeftMask && (
					<div
						className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent md:hidden"
						aria-hidden="true"
					/>
				)}
				{showRightMask && (
					<div
						className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent md:hidden"
						aria-hidden="true"
					/>
				)}
			</div>
		</TooltipProvider>
	);
};

export default EditorToolbar;
