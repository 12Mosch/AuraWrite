# Convex Error Handling Guide

This document explains how to properly handle errors in Convex queries, mutations, and actions in the AuraWrite application.

## Overview

Convex handles errors differently than traditional REST APIs. Understanding these patterns is crucial for building robust applications.

## Error Types in Convex

### 1. Query Errors
- **How they occur**: Thrown directly from `useQuery` hooks during component rendering
- **Handling**: Use React Error Boundaries (recommended approach)
- **Retrying**: Not recommended - Convex queries are deterministic

### 2. Mutation Errors
- **How they occur**: Promise rejections from mutation calls
- **Handling**: Use `.catch()` or `try/catch` with async/await
- **Retrying**: Automatic retry by Convex client

### 3. Action Errors
- **How they occur**: Promise rejections from action calls
- **Handling**: Use `.catch()` or `try/catch` with async/await
- **Retrying**: Manual retry required (actions may have side effects)

## Implementation

### Query Error Handling

#### ❌ Incorrect Approach (Won't Work)
```typescript
// This won't catch Convex query errors!
const useDocumentMetadata = (documentId: string) => {
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    try {
      // This try-catch won't catch useQuery errors
      const metadata = useQuery(api.documents.get, { documentId });
    } catch (error) {
      setError(error); // This will never execute
    }
  }, [documentId]);
  
  return { error }; // error will always be null
};
```

#### ✅ Correct Approach (Error Boundaries)
```typescript
// 1. Clean hook implementation
const useDocumentMetadata = (documentId: string) => {
  // Convex queries throw errors directly from useQuery
  const metadata = useQuery(
    api.documents.get, 
    documentId ? { documentId } : "skip"
  );
  
  const isLoading = documentId && metadata === undefined;
  
  return { metadata, isLoading };
};

// 2. Wrap components with error boundaries
<ConvexErrorBoundary>
  <DocumentComponent />
</ConvexErrorBoundary>
```

### Mutation Error Handling

```typescript
const MyComponent = () => {
  const updateDocument = useMutation(api.documents.update);
  
  const handleUpdate = async (data: any) => {
    try {
      await updateDocument(data);
      // Success handling
    } catch (error) {
      // Error handling
      console.error('Update failed:', error);
      // Show user-friendly error message
    }
  };
  
  return <button onClick={() => handleUpdate(data)}>Update</button>;
};
```

### Action Error Handling

```typescript
const MyComponent = () => {
  const sendEmail = useAction(api.emails.send);
  
  const handleSendEmail = async (emailData: any) => {
    try {
      await sendEmail(emailData);
      // Success handling
    } catch (error) {
      // Error handling - may need manual retry
      console.error('Email send failed:', error);
      
      // Decide whether to retry based on error type
      if (isRetryableError(error)) {
        // Implement retry logic
      }
    }
  };
  
  return <button onClick={() => handleSendEmail(data)}>Send Email</button>;
};
```

## Error Boundary Setup

### Application Level
```typescript
// App.tsx
import { ConvexErrorBoundary } from './components/ConvexErrorBoundary';

function App() {
  return (
    <ConvexProvider client={convex}>
      <ConvexErrorBoundary
        onError={(error) => {
          // Report to error tracking service
          console.error('Application error:', error);
        }}
      >
        <Router>
          <Routes>
            {/* Your routes */}
          </Routes>
        </Router>
      </ConvexErrorBoundary>
    </ConvexProvider>
  );
}
```

### Component Level
```typescript
// For granular error handling
<ConvexErrorBoundary
  componentName="DocumentMetadata"
  fallback={(error, errorInfo, retry) => (
    <div>
      <h3>Failed to load document metadata</h3>
      <button onClick={retry}>Try Again</button>
    </div>
  )}
>
  <DocumentMetadataComponent />
</ConvexErrorBoundary>
```

## Error Categories

The `ConvexErrorBoundary` automatically categorizes errors:

- **Network Errors**: Connection issues, timeouts
- **Authentication Errors**: Unauthorized access
- **Rate Limit Errors**: Too many requests
- **Validation Errors**: Invalid data, read/write limits
- **Server Errors**: Internal Convex errors

## Best Practices

### 1. Use Error Boundaries for Queries
- Wrap components that use `useQuery` with error boundaries
- Don't try to catch query errors in `useEffect` or event handlers

### 2. Handle Mutation Errors Explicitly
- Always use try/catch or .catch() with mutations
- Provide user feedback for failed mutations
- Consider optimistic updates with rollback

### 3. Implement Proper Action Error Handling
- Actions may have side effects, so retry carefully
- Log action errors for debugging
- Provide clear user feedback

### 4. Error Reporting
- Integrate with error tracking services (Sentry, LogRocket)
- Log errors with sufficient context
- Monitor error rates and patterns

### 5. User Experience
- Show appropriate loading states
- Provide retry mechanisms where appropriate
- Display user-friendly error messages
- Avoid exposing technical details to end users

## Common Pitfalls

1. **Trying to catch query errors in useEffect** - Won't work
2. **Not handling mutation promise rejections** - Causes unhandled promise rejections
3. **Retrying non-retryable errors** - Wastes resources
4. **Exposing technical error details** - Poor user experience
5. **Not categorizing errors properly** - Leads to inappropriate handling

## Testing Error Scenarios

```typescript
// Test error boundaries
it('should handle query errors gracefully', () => {
  const ThrowError = () => {
    throw new Error('Test Convex error');
  };
  
  render(
    <ConvexErrorBoundary>
      <ThrowError />
    </ConvexErrorBoundary>
  );
  
  expect(screen.getByText(/Unable to Load Data/)).toBeInTheDocument();
});
```

## Migration from Old Error Handling

If you have existing code with manual error handling in hooks:

1. Remove `useState` and `useEffect` error handling
2. Remove `error` from hook return types
3. Wrap components with appropriate error boundaries
4. Update tests to expect error boundaries instead of error states

This approach aligns with Convex best practices and provides better error handling patterns.
