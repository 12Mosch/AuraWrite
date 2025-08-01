/**
 * Cloud-based document recovery system
 * Replaces local backup system with cloud-based recovery using Convex
 */

import { useConvex } from "convex/react";
import * as Y from "yjs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Recover a corrupted document from cloud storage
 * This replaces the local backup system with cloud-based recovery
 */
export const recoverDocumentFromCloud = async (
	convex: any,
	documentId: Id<"documents">,
): Promise<Y.Doc | null> => {
	try {
		console.log(`Attempting to recover document from cloud: ${documentId}`);

		// Fetch the latest document state from Convex (including Y.js state)
		const document = await convex.query(api.documents.getDocumentForRecovery, {
			documentId,
		});

		if (!document) {
			console.log("Document not found in cloud storage");
			return null;
		}

		// Create new Y.Doc and apply cloud state
		const recoveredDoc = new Y.Doc();

		if (document.yjsState) {
			// Apply Y.js binary state if available
			Y.applyUpdate(recoveredDoc, document.yjsState);
			console.log("Document recovered from Y.js cloud state");
		} else if (document.content) {
			// Fallback to legacy Slate content if available
			const sharedType = recoveredDoc.get("content", Y.XmlText);
			try {
				const slateContent = JSON.parse(document.content);
				// Convert Slate content to Y.js (simplified)
				recoveredDoc.transact(() => {
					const textContent = extractTextFromSlate(slateContent);
					sharedType.insert(0, textContent);
				});
				console.log("Document recovered from legacy Slate content");
			} catch (parseError) {
				console.warn("Failed to parse legacy content:", parseError);
				return null;
			}
		} else {
			console.log("No recoverable content found in cloud document");
			return null;
		}

		return recoveredDoc;
	} catch (error) {
		console.error("Failed to recover document from cloud:", error);
		return null;
	}
};

/**
 * Extract plain text from Slate.js content structure
 */
const extractTextFromSlate = (slateNodes: any[]): string => {
	let text = "";

	const extractFromNode = (node: any): void => {
		if (node.text !== undefined) {
			text += node.text;
		}
		if (node.children && Array.isArray(node.children)) {
			node.children.forEach(extractFromNode);
		}
	};

	slateNodes.forEach(extractFromNode);
	return text;
};

/**
 * Create a fallback document with recovery message
 */
export const createFallbackDocument = (): Y.Doc => {
	const newDoc = new Y.Doc();
	const sharedType = newDoc.get("content", Y.XmlText);

	newDoc.transact(() => {
		sharedType.insert(0, "Document recovery in progress...\n\n");
		sharedType.insert(
			sharedType.length,
			"This document experienced a local storage issue. ",
		);
		sharedType.insert(
			sharedType.length,
			"Your content is safely stored in the cloud and will be restored automatically.",
		);
	});

	return newDoc;
};

/**
 * Hook for cloud-based document recovery
 */
export const useCloudRecovery = () => {
	const convex = useConvex();

	const recoverDocument = async (
		documentId: Id<"documents">,
	): Promise<Y.Doc | null> => {
		return await recoverDocumentFromCloud(convex, documentId);
	};

	const createFallback = (): Y.Doc => {
		return createFallbackDocument();
	};

	return {
		recoverDocument,
		createFallback,
	};
};
