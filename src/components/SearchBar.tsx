import { useMutation, useQuery } from "convex/react";
import { Command, Search, Settings, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import {
	AdvancedSearchModal,
	type SearchCriteria,
} from "./AdvancedSearchModal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	onSearch?: (query: string) => void;
	onAdvancedSearch?: (criteria: SearchCriteria) => void;
	placeholder?: string;
	className?: string;
	showShortcut?: boolean;
	autoFocus?: boolean;
	onError?: (error: unknown) => void;
}

interface SearchSuggestion {
	query: string;
	type: "history" | "suggestion";
	searchedAt?: number;
}

export const SearchBar: React.FC<SearchBarProps> = ({
	value,
	onChange,
	onSearch,
	onAdvancedSearch,
	placeholder = "Search documents...",
	className,
	showShortcut = true,
	autoFocus = false,
	onError,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Fetch search history for autocomplete
	const searchHistory = useQuery(api.savedSearches.getSearchHistory, {
		limit: 5,
	});
	const addToHistory = useMutation(api.savedSearches.addToSearchHistory);

	// Generate suggestions based on search history
	const suggestions: SearchSuggestion[] = React.useMemo(() => {
		if (!searchHistory || !value.trim()) return [];

		return searchHistory
			.filter(
				(item) =>
					item.query.toLowerCase().includes(value.toLowerCase()) &&
					item.query.toLowerCase() !== value.toLowerCase(),
			)
			.slice(0, 5)
			.map((item) => ({
				query: item.query,
				type: "history" as const,
				searchedAt: item.searchedAt,
			}));
	}, [searchHistory, value]);

	// Handle keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd+K or Ctrl+K to focus search
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				inputRef.current?.focus();
				setIsOpen(true);
			}

			// Escape to close suggestions
			if (e.key === "Escape") {
				setIsOpen(false);
				setSelectedIndex(-1);
				inputRef.current?.blur();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	// Handle clicks outside to close suggestions
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
				setSelectedIndex(-1);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Handle input change
	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newValue = e.target.value;
			onChange(newValue);
			setIsOpen(newValue.trim().length > 0);
			setSelectedIndex(-1);
		},
		[onChange],
	);

	// Handle input focus
	const handleInputFocus = useCallback(() => {
		if (value.trim().length > 0) {
			setIsOpen(true);
		}
	}, [value]);

	// Handle suggestion selection
	const handleSuggestionSelect = useCallback(
		async (suggestion: SearchSuggestion) => {
			onChange(suggestion.query);
			setIsOpen(false);
			setSelectedIndex(-1);

			// Add to search history if it's a new search
			if (
				suggestion.type === "suggestion" ||
				!searchHistory?.some((h) => h.query === suggestion.query)
			) {
				try {
					await addToHistory({ query: suggestion.query });
				} catch (error) {
					onError?.(error);
				}
			}

			// Trigger search
			onSearch?.(suggestion.query);
		},
		[onChange, onSearch, addToHistory, searchHistory, onError],
	);

	// Handle keyboard navigation in suggestions
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!isOpen || suggestions.length === 0) {
				if (e.key === "Enter" && value.trim()) {
					// Perform search on Enter
					onSearch?.(value);
					// Add to history
					addToHistory({ query: value }).catch((error) => {
						onError?.(error);
					});
					setIsOpen(false);
				}
				return;
			}

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) =>
						prev < suggestions.length - 1 ? prev + 1 : 0,
					);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) =>
						prev > 0 ? prev - 1 : suggestions.length - 1,
					);
					break;
				case "Enter":
					e.preventDefault();
					if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
						handleSuggestionSelect(suggestions[selectedIndex]);
					} else if (value.trim()) {
						onSearch?.(value);
						addToHistory({ query: value }).catch((error) => {
							onError?.(error);
						});
						setIsOpen(false);
					}
					break;
				case "Tab":
					if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
						e.preventDefault();
						onChange(suggestions[selectedIndex].query);
					}
					break;
			}
		},
		[
			isOpen,
			suggestions,
			selectedIndex,
			value,
			onSearch,
			onChange,
			handleSuggestionSelect,
			addToHistory,
			onError,
		],
	);

	// Handle clear button
	const handleClear = useCallback(() => {
		onChange("");
		setIsOpen(false);
		setSelectedIndex(-1);
		inputRef.current?.focus();
	}, [onChange]);

	// Handle advanced search
	const handleAdvancedSearch = useCallback(
		(criteria: SearchCriteria) => {
			if (onAdvancedSearch) {
				onAdvancedSearch(criteria);
			}
			// Also update the basic search input if there's a query
			if (criteria.query) {
				onChange(criteria.query);
			}
		},
		[onAdvancedSearch, onChange],
	);

	return (
		<div ref={containerRef} className={cn("relative", className)}>
			<div className="relative">
				<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					type="search"
					placeholder={placeholder}
					value={value}
					onChange={handleInputChange}
					onFocus={handleInputFocus}
					onKeyDown={handleKeyDown}
					autoFocus={autoFocus}
					className={cn(
						"pl-10 h-9",
						value && "pr-28",
						showShortcut && !value && "pr-24",
					)}
				/>

				{/* Advanced Search button */}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setIsAdvancedSearchOpen(true)}
					className="absolute right-16 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
					title="Advanced Search"
				>
					<Settings className="h-3 w-3" />
				</Button>

				{/* Clear button */}
				{value && (
					<Button
						variant="ghost"
						size="sm"
						onClick={handleClear}
						className="absolute right-8 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
					>
						<X className="h-3 w-3" />
					</Button>
				)}

				{/* Keyboard shortcut hint */}
				{showShortcut && !value && (
					<div
						className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1 text-xs text-muted-foreground"
						role="note"
						aria-label="Keyboard shortcut: Press Control and K on Windows or Command and K on Mac to focus the search"
					>
						<Command className="h-3 w-3" aria-hidden="true" />
						<span aria-hidden="true">K</span>
					</div>
				)}
			</div>

			{/* Suggestions dropdown */}
			{isOpen && suggestions.length > 0 && (
				<div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-50 max-h-60 overflow-y-auto">
					{suggestions.map((suggestion, index) => (
						<button
							key={`${suggestion.type}-${suggestion.query}`}
							type="button"
							onClick={() => handleSuggestionSelect(suggestion)}
							className={cn(
								"w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
								"flex items-center gap-2 border-b last:border-b-0",
								selectedIndex === index && "bg-accent text-accent-foreground",
							)}
						>
							<Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
							<span className="flex-1 truncate">{suggestion.query}</span>
							{suggestion.type === "history" && (
								<span className="text-xs text-muted-foreground">Recent</span>
							)}
						</button>
					))}
				</div>
			)}

			{/* Advanced Search Modal */}
			<AdvancedSearchModal
				isOpen={isAdvancedSearchOpen}
				onOpenChange={setIsAdvancedSearchOpen}
				onSearch={handleAdvancedSearch}
				initialCriteria={{ query: value || undefined }}
			/>
		</div>
	);
};
