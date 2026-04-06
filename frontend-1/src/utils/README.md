# Route Context System

This system automatically extracts context information from the current route and passes it to the AI chat backend, enabling context-aware conversations.

## How it Works

### 1. Route Pattern Recognition

The system recognizes state-based routes with the following patterns:
- `/purchase_requisition/preq_2afedf28-045e-4093-9b83-89871bca3e4b/state/Draft`
- `/purchase_order/po_123/state/Pending`
- `/invoice/inv_456/state/Approved`
- `/purchase_requisition/preq_789/view/view_1`

### 2. Context Extraction

The `extractRouteContext()` function parses the URL and extracts:
- **modelName**: The entity type (e.g., `purchase_requisition`, `purchase_order`)
- **recordId**: The specific record ID (e.g., `preq_2afedf28-045e-4093-9b83-89871bca3e4b`)
- **stateId**: The current state (e.g., `Draft`, `Pending`)
- **viewId**: The view mode if applicable (e.g., `view_1`)

### 3. Backend Integration

When a user is on a state-based route and opens the chat:
- The context is automatically passed to the backend via the `useChat` hook
- The AI can understand what record the user is working with
- Responses can be tailored to the specific context

### 4. UI Enhancements

The chat interface shows:
- Context information banner when on a state-based route
- Context-aware placeholder text
- Relevant suggestion chips based on the current record type

## Usage

### In ChatUI Component

```typescript
import { extractRouteContext, isStateBasedRoute, getModelDisplayName } from '@/utils/routeUtils';

// Extract context from current route
const routeContext = extractRouteContext(location.pathname);
const isStateRoute = isStateBasedRoute(location.pathname);

// Pass to backend
const { messages, input, handleSubmit } = useChat({
  api: '/api/agent/chat/stream',
  body: {
    stream: true,
    context: isStateRoute ? {
      modelName: routeContext.modelName,
      recordId: routeContext.recordId,
      stateId: routeContext.stateId,
      viewId: routeContext.viewId,
      modelDisplayName: getModelDisplayName(routeContext.modelName),
      currentPath: location.pathname
    } : undefined
  }
});
```

### Supported Models

The system recognizes these model types:
- `purchase_requisition` → Purchase Requisition
- `purchase_order` → Purchase Order
- `invoice` → Invoice
- `organization` → Organization
- `item_master` → Item Master
- `supplier` → Supplier
- And many more...

## Benefits

1. **Context-Aware AI**: The AI knows what record the user is working with
2. **Better Suggestions**: Chat suggestions are tailored to the current context
3. **Improved UX**: Users see relevant context information
4. **Seamless Integration**: Works automatically without user intervention

## Example Scenarios

### Purchase Requisition Context
When on `/purchase_requisition/preq_123/state/Draft`:
- AI knows you're working with a Draft purchase requisition
- Can suggest relevant actions like "Submit for approval"
- Can answer questions about the specific record

### Purchase Order Context
When on `/purchase_order/po_456/state/Pending`:
- AI understands you're viewing a pending purchase order
- Can provide status updates and next steps
- Can help with order modifications

## Backend Integration

The backend receives context in this format:
```json
{
  "modelName": "purchase_requisition",
  "recordId": "preq_2afedf28-045e-4093-9b83-89871bca3e4b",
  "stateId": "Draft",
  "viewId": null,
  "modelDisplayName": "Purchase Requisition",
  "currentPath": "/purchase_requisition/preq_2afedf28-045e-4093-9b83-89871bca3e4b/state/Draft"
}
```

This enables the AI to provide more relevant and contextual responses. 