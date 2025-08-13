# Memory Bank Index

Purpose
- Central entry point to lightweight, persistent summaries for fast onboarding and consistent decisions.

Scope
- Summaries only (no deep examples). Covers Tech Stack, Core Architecture, High-level Data Model, Error Handling.

Files
- Tech Stack: [TECH_STACK.md](./TECH_STACK.md)
- Architecture Overview: [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)
- Data Model: [DATA_MODEL.md](./DATA_MODEL.md)
- Error Handling Policy: [ERROR_HANDLING_POLICY.md](./ERROR_HANDLING_POLICY.md)
- Project Description: [PROJECT_DESCRIPTION.md](./PROJECT_DESCRIPTION.md)

Conventions
- Keep each page short and scannable; prefer bullets over paragraphs.
- Avoid code snippets unless absolutely necessary for disambiguation.
- Link to source-of-truth files when relevant (e.g., [convex/schema.ts](../../../convex/schema.ts), [src/ui/App.tsx](../../../src/ui/App.tsx)).
- Use consistent terminology with the UI and backend data model.
- Update immediately when dependencies or schema change.

Maintenance Triggers
- Dependency version updates in [package.json](../../../package.json).
- Schema or table/index changes in [convex/schema.ts](../../../convex/schema.ts).
- Error handling changes in [docs/CONVEX_ERROR_HANDLING.md](../../../docs/CONVEX_ERROR_HANDLING.md).
- App shell or auth flow changes in [src/ui/App.tsx](../../../src/ui/App.tsx).
