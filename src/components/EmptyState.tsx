import { BookOpen, FileText, Plus, Upload } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

export interface EmptyStateProps {
	onCreateDocument?: () => void;
	className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
	onCreateDocument,
	className,
}) => {
	return (
		<div
			className={cn(
				"flex items-center justify-center min-h-[60vh] p-6",
				className,
			)}
		>
			<div className="text-center max-w-md">
				{/* Icon */}
				<div className="mx-auto mb-6 h-24 w-24 rounded-full bg-muted/50 flex items-center justify-center">
					<FileText className="h-12 w-12 text-muted-foreground" />
				</div>

				{/* Heading */}
				<h2 className="text-2xl font-semibold mb-2">No documents yet</h2>

				{/* Description */}
				<p className="text-muted-foreground mb-8 leading-relaxed">
					Get started by creating your first document. You can write,
					collaborate, and organize all your content in one place.
				</p>

				{/* Primary Action */}
				<div className="space-y-4">
					<Button size="lg" onClick={onCreateDocument} className="gap-2">
						<Plus className="h-5 w-5" />
						Create Your First Document
					</Button>

					{/* Quick Actions */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
						<Card className="cursor-pointer hover:bg-muted/50 transition-colors">
							<CardContent className="p-4 text-center">
								<BookOpen className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
								<h3 className="font-medium text-sm mb-1">Start Writing</h3>
								<p className="text-xs text-muted-foreground">
									Create a blank document
								</p>
							</CardContent>
						</Card>

						<Card className="cursor-pointer hover:bg-muted/50 transition-colors">
							<CardContent className="p-4 text-center">
								<Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
								<h3 className="font-medium text-sm mb-1">Import</h3>
								<p className="text-xs text-muted-foreground">
									Upload existing files
								</p>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Help Text */}
				<div className="mt-8 pt-6 border-t">
					<p className="text-xs text-muted-foreground">
						Need help getting started? Check out our{" "}
						<button type="button" className="underline hover:no-underline">
							documentation
						</button>{" "}
						or{" "}
						<button type="button" className="underline hover:no-underline">
							tutorials
						</button>
						.
					</p>
				</div>
			</div>
		</div>
	);
};
