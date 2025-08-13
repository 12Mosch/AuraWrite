# Error Handling Policy (Convex + React)

Purpose
- Lightweight summary of how AuraWrite handles errors across queries, mutations, and actions.

Sources
- See [../../../docs/CONVEX_ERROR_HANDLING.md](../../../docs/CONVEX_ERROR_HANDLING.md)
- See [../../../src/ui/App.tsx](../../../src/ui/App.tsx)
- See [../../../src/components/ErrorBoundary.tsx](../../../src/components/ErrorBoundary.tsx)
- See [../../../src/components/ConvexErrorBoundary.tsx](../../../src/components/ConvexErrorBoundary.tsx)

Overview
- Query errors surface at render time; handle via Error Boundaries, not try/catch.
- Mutations and actions reject Promises; handle via try/catch (or .catch).
- Provide user-friendly feedback and logging; avoid exposing raw technical details.

Queries
- Use React error boundaries to capture and render query errors.
- Loading is indicated when useQuery returns undefined; render skeletons/placeholders.
- Do not attempt to catch query errors in useEffect or event handlers.

Mutations
- Wrap calls in try/catch; show actionable user feedback (e.g., toast).
- Consider optimistic updates with rollback on failure where appropriate.
- Allow Convex client automatic retries; avoid custom retry unless necessary.

Actions
- Wrap calls in try/catch; implement manual retry/backoff when side effects allow.
- Ensure idempotency or compensating actions if retries are possible.
- Log action failures for observability.

Error Categorization
- Boundary components should categorize errors for consistent UX:
  - Network, Authentication, Authorization/Permission, Rate Limit, Validation, Server/Internal.
- Show tailored messages and appropriate retry affordances per category.

UX Guidelines
- Always show loading states before data is ready.
- Provide retry buttons for recoverable failures (e.g., network hiccups).
- Prefer concise, non-technical messages; include optional “Details” for diagnostics.

Reporting and Logging
- Centralize error logging in error boundaries and mutation/action catch blocks.
- Consider integration with an error tracking service.
- Attach contextual metadata (feature area, inputs, correlation IDs if available).

Quick Rules
- Queries → Boundaries; Mutations/Actions → try/catch.
- Never swallow errors silently; either surface or log with context.
- Prefer safe retries; avoid retry loops for validation/permission errors.
- Keep UI responsive and informative (loading, error, retry).

References
- Implementation details and examples: [../../../docs/CONVEX_ERROR_HANDLING.md](../../../docs/CONVEX_ERROR_HANDLING.md)
- App shell boundary usage: [../../../src/ui/App.tsx](../../../src/ui/App.tsx)