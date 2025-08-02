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

	const fontSizes = [
		{ value: "10", label: "10px" },
		{ value: "12", label: "12px" },
		{ value: "14", label: "14px" },
		{ value: "16", label: "16px" },
		{ value: "18", label: "18px" },
		{ value: "20", label: "20px" },
		{ value: "24", label: "24px" },
		{ value: "28", label: "28px" },
		{ value: "32", label: "32px" },
		{ value: "36", label: "36px" },
	];

	const fontFamilies = [
		{ value: "Inter", label: "Inter" },
		{ value: "Arial", label: "Arial" },
		{ value: "Helvetica", label: "Helvetica" },
		{ value: "Times New Roman", label: "Times New Roman" },
		{ value: "Georgia", label: "Georgia" },
		{ value: "Courier New", label: "Courier New" },
		{ value: "Verdana", label: "Verdana" },
	];

	return (
		<TooltipProvider>
			<div className="flex items-center gap-1 p-2 bg-background border-b overflow-x-auto">
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
						onValueChange={(value) => handleAction("format.fontFamily", value)}
					>
						<SelectTrigger className="w-32">
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
						onValueChange={(value) => handleAction("format.fontSize", value)}
					>
						<SelectTrigger className="w-20">
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
							>
								<Strikethrough className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Strikethrough</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={activeFormats.code}
								onPressedChange={() => handleAction("format.code")}
								size="sm"
							>
								<Code className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Code</TooltipContent>
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
							>
								<AlignLeft className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Align Left</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={currentAlignment === "center"}
								onPressedChange={() => handleAction("format.alignCenter")}
								size="sm"
							>
								<AlignCenter className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Align Center</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={currentAlignment === "right"}
								onPressedChange={() => handleAction("format.alignRight")}
								size="sm"
							>
								<AlignRight className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Align Right</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								pressed={currentAlignment === "justify"}
								onPressedChange={() => handleAction("format.alignJustify")}
								size="sm"
							>
								<AlignJustify className="h-4 w-4" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>Justify</TooltipContent>
					</Tooltip>
				</div>

				<Separator orientation="vertical" className="h-6" />

				{/* Lists and Blocks */}
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleAction("format.bulletList")}
							>
								<List className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Bullet List</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleAction("format.numberedList")}
							>
								<ListOrdered className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Numbered List</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleAction("format.blockquote")}
							>
								<Quote className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Quote</TooltipContent>
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
						<TooltipContent>Insert Link</TooltipContent>
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
			</div>
		</TooltipProvider>
	);
};

export default EditorToolbar;
