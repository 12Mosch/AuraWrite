// Shared Slate type definitions
import type { BaseEditor } from "slate";
import type { ReactEditor } from "slate-react";

// Custom element types for the rich text editor
export type ParagraphElement = {
	type: "paragraph";
	align?: "left" | "center" | "right" | "justify";
	children: CustomText[];
};

export type HeadingElement = {
	type: "heading";
	level: 1 | 2 | 3 | 4 | 5 | 6;
	children: CustomText[];
};

export type BlockquoteElement = {
	type: "blockquote";
	align?: "left" | "center" | "right" | "justify";
	children: CustomText[];
};

export type BulletedListElement = {
	type: "bulleted-list";
	children: ListItemElement[];
};

export type NumberedListElement = {
	type: "numbered-list";
	children: ListItemElement[];
};

export type ListItemElement = {
	type: "list-item";
	children: (
		| CustomText
		| BulletedListElement
		| NumberedListElement
		| ParagraphElement
	)[];
};

export type CodeBlockElement = {
	type: "code-block";
	children: CustomText[];
};

export type CustomElement =
	| ParagraphElement
	| HeadingElement
	| BlockquoteElement
	| BulletedListElement
	| NumberedListElement
	| ListItemElement
	| CodeBlockElement;

export type CustomText = {
	text: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	code?: boolean;
	fontSize?: string;
	fontFamily?: string;
	color?: string;
};

// Editor formats interface
export interface EditorFormats {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	code?: boolean;
	fontSize?: string;
	fontFamily?: string;
	color?: string;
}

declare module "slate" {
	interface CustomTypes {
		Editor: BaseEditor & ReactEditor;
		Element: CustomElement;
		Text: CustomText;
	}
}
