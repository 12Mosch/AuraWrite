# Tech Stack

This page summarizes the core technologies used by AuraWrite.

Note: Version numbers reflect package.json as of 2025-08. Prefer updating this page when package.json changes.

Application surfaces
- Web app: Vite + React 19
- Desktop app: Electron 37 (main and preload built from TypeScript)

Frontend framework and tooling
- Language: TypeScript 5.9
- Bundler/dev server: Vite 7
- Data layer: Convex React client for live queries, mutations, actions, and subscriptions
- Package management: npm
- Lint/format: Biome

Styling and UI
- Tailwind CSS 4 with @tailwindcss/vite
- Radix UI primitives (Alert Dialog, Dialog, Dropdown Menu, etc.)
- UI components under src/components/ui
- Icons: lucide-react
- Themes: next-themes

Editor and collaboration
- Slate core with slate-react and slate-history for rich text editor primitives
- Yjs CRDT for real-time collaboration
- y-indexeddb for offline-first local persistence of Y.Doc state
- Slate–Yjs binding via @slate-yjs/core and @slate-yjs/react

Backend and data
- Convex 1.25 for data, queries, mutations, actions, and subscriptions
- Schema includes documents, documentVersions, collaborationSessions, folders, templates, savedSearches, searchHistory
- Search support via Convex search indexes (e.g., search_title on documents)

Auth
- @convex-dev/auth with @auth/core password flow
- Authenticated/Unauthenticated/AuthLoading layout guards in the app shell

Build and dev scripts
- npm run dev starts Vite, Electron, and the Convex dev server in parallel
- npm run build compiles TypeScript and builds Vite

Notable utilities
- date-fns, use-debounce, class-variance-authority, clsx, tailwind-merge
- Notifications: sonner

References
- See [PROJECT_DESCRIPTION.md](.kilocode/rules/memory-bank/PROJECT_DESCRIPTION.md)