# Tool Responses Components

This folder contains components for rendering different types of tool responses in the chat interface.

## Folder Structure

```
tool-responses/
├── index.ts                 # Exports all components
├── ToolResponseRenderer.tsx # Main component with switch case logic
├── SqlResultsTable.tsx      # Component for SQL query results
└── README.md               # This documentation
```

## Components

### ToolResponseRenderer

The main component that handles different tool responses based on the `uiHint` property. It uses a switch case to render the appropriate component for each response type.

**Supported uiHint values:**
- `table` - Renders table data (SQL results or search results)
- `chart` - Placeholder for chart visualizations (coming soon)
- `form` - Placeholder for form interfaces (coming soon)
- `list` - Placeholder for list views (coming soon)
- `default` - Fallback for unknown response types

### SqlResultsTable

Specifically designed for SQL query results with:
- Proper date formatting using date-fns
- Boolean value handling
- Long text truncation
- Responsive table design
- Row count display
- Result type indicator

## Usage

```tsx
import { ToolResponseRenderer } from './tool-responses';

// In your component
<ToolResponseRenderer toolInvocations={message.toolInvocations} />
```

## Data Structure

The components expect tool invocations with this structure:

```typescript
interface ToolInvocation {
    toolName: string;
    state: string;
    result?: {
        uiHint: string;
        description?: string;
        data: any[];
        columns: Array<{ field: string; label: string }>;
        resultType?: string;
    };
}
```

## Extending

To add new response types:

1. Create a new component in this folder
2. Add a new case in the switch statement in `ToolResponseRenderer.tsx`
3. Export the component from `index.ts`
4. Update this README with the new functionality 