import type React from "react";
import {useCallback, useMemo, useState} from "react";
import type {Descendant} from "slate";
import type {Id} from "../../../convex/_generated/dataModel";
import {EditorLayout} from "./EditorLayout";
import {TextEditor} from "./TextEditor";

interface AuraTextEditorProps {
	documentId?: Id<"documents">;
	initialValue?: Descendant[];
	className?: string;
	readOnly?: boolean;
	showMenuBar?: boolean;
	showToolbar?: boolean;
	showStatusBar?: boolean;
	documentTitle?: string;
	onSave?: (value: Descendant[]) => void;
	onChange?: (value: Descendant[]) => void;
	onSignOut?: () => void;
}

export const AuraTextEditor: React.FC<AuraTextEditorProps> = ({
	initialValue,
	className = "",
	readOnly = false,
	showMenuBar = true,
	showToolbar = true,
	showStatusBar = true,
	documentTitle = "Untitled Document",
	onSave,
	onChange,
	onSignOut,
}) => {
	// Editor state
	const [editorValue, setEditorValue] = useState<Descendant[]>(
		initialValue || [{ type: "paragraph", children: [{ text: "" }] }],
	);
	const [isModified, setIsModified] = useState(false);
	const [lastSaved, setLastSaved] = useState<Date>(new Date());

	// Calculate document statistics
	const documentStats = useMemo(() => {
		const text = editorValue
			.map((node) => {
				if ("children" in node) {
					return node.children
						.map((child) => ("text" in child ? child.text : ""))
						.join("");
				}
				return "";
			})
			.join(" ");

		const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
		const characterCount = text.length;

		return { wordCount, characterCount };
	}, [editorValue]);

	// Handle editor value changes
	const handleEditorChange = useCallback(
		(value: Descendant[]) => {
			setEditorValue(value);
			setIsModified(true);
			onChange?.(value);
		},
		[onChange],
	);

	// Handle format changes
	const handleFormatChange = useCallback(() => {
		// Format changes are handled by the TextEditor component
	}, []);

	// Handle selection changes
	const handleSelectionChange = useCallback(() => {
		// Selection changes are handled by the TextEditor component
	}, []);

	// Handle menu actions
	const handleMenuAction = useCallback(
		(action: string, data?: unknown) => {
			switch (action) {
				case "file.save":
					if (onSave) {
						onSave(editorValue);
						setIsModified(false);
						setLastSaved(new Date());
					}
					break;
				case "file.new":
					setEditorValue([{ type: "paragraph", children: [{ text: "" }] }]);
					setIsModified(false);
					break;
				case "edit.undo":
					// This would be handled by the editor's history plugin
					break;
				case "edit.redo":
					// This would be handled by the editor's history plugin
					break;
				default:
					console.log("Menu action:", action, data);
			}
		},
		[editorValue, onSave],
	);

	// Handle toolbar actions
	const handleToolbarAction = useCallback((action: string, data?: unknown) => {
		switch (action) {
			case "format.bold":
			case "format.italic":
			case "format.underline":
			case "format.strikethrough":
			case "format.code":
			case "format.fontSize":
			case "format.fontFamily":
			case "format.alignLeft":
			case "format.alignCenter":
			case "format.alignRight":
			case "format.alignJustify":
				// These are handled by the TextEditor component
				break;
			default:
				console.log("Toolbar action:", action, data);
		}
	}, []);

	return (
		<div className={`aura-text-editor h-full ${className}`}>
			<EditorLayout
				showMenuBar={showMenuBar}
				showToolbar={showToolbar}
				showStatusBar={showStatusBar}
				onMenuAction={handleMenuAction}
				onToolbarAction={handleToolbarAction}
				onSignOut={onSignOut}
				documentTitle={documentTitle}
				documentStatus={{
					wordCount: documentStats.wordCount,
					characterCount: documentStats.characterCount,
					isModified,
					lastSaved,
					syncStatus: "synced", // This would come from the collaboration system
				}}
			>
				<TextEditor
					value={editorValue}
					onChange={handleEditorChange}
					onFormatChange={handleFormatChange}
					onSelectionChange={handleSelectionChange}
					readOnly={readOnly}
					autoFocus={!readOnly}
					placeholder="Start writing your document..."
					className="h-full"
				/>
			</EditorLayout>
		</div>
	);
};

export default AuraTextEditor;
