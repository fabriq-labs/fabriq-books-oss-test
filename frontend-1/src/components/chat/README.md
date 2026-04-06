# Chat Component Documentation

This document provides a comprehensive overview of the chat functionality in the application. It explains how the chat system works, its architecture, data flow, and key concepts.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Components](#key-components)
- [Data Flow](#data-flow)
- [Context-Aware Chat](#context-aware-chat)
- [Message Transformation](#message-transformation)
- [File Attachments](#file-attachments)
- [Tool Invocations](#tool-invocations)
- [Usage Examples](#usage-examples)
- [Important Concepts](#important-concepts)

## 🎯 Overview

The Chat component provides an AI-powered chat interface that:
- Supports streaming responses from the backend
- Is context-aware based on the current route (e.g., viewing a specific invoice or purchase order)
- Handles file attachments (images, documents, etc.)
- Processes tool invocations from the AI (e.g., creating records, displaying data)
- Maintains chat history across sessions via context
- Provides dynamic suggestions based on the current context

## 🏗️ Architecture

### File Structure

```
src/components/chat/
├── ChatUI.tsx           # Main chat component (UI logic, hooks, rendering)
├── chatUtils.ts         # Utility functions (message transformation, file handling, context building)
├── ChatDrawer.tsx       # Drawer wrapper for chat
├── SearchResultsTable.tsx
└── tool-responses/      # Tool response renderers
    ├── ToolResponseRenderer.tsx
    ├── InvoiceMapPreview.tsx
    ├── MetricsDisplay.tsx
    ├── SqlResultsTable.tsx
    └── README.md
```

### Component Hierarchy

```
ChatUI
├── Route Context Extraction & Sync
├── useChat Hook (@ai-sdk/react)
│   ├── Message Stream Handling
│   ├── Tool Invocation Processing
│   └── Request Body Transformation
├── Chat Context Sync (useChatContext)
├── UI Rendering
│   ├── Empty State (suggestions + input)
│   ├── Chat Messages
│   ├── Tool Response Renderers
│   └── Input with Attachments
└── File Handling
```

## 🔧 Key Components

### ChatUI.tsx

The main chat component that orchestrates all chat functionality.

**Key Responsibilities:**
- Managing chat state (messages, input, files)
- Handling route context extraction and synchronization
- Configuring the `useChat` hook with API endpoints and callbacks
- Rendering different UI states (empty, active chat)
- Processing tool invocations and handling redirects
- File upload and attachment management

**Props:**
```typescript
interface ChatUIProps {
    sidebarMode?: boolean;  // Adjusts layout for sidebar vs full-page mode
}
```

**Key State:**
- `selectedFiles`: Array of files selected for attachment
- `messages`: Chat messages from `useChat` hook
- `input`: Current input text
- `status`: Streaming status ('streaming' | 'idle' | etc.)

### chatUtils.ts

Contains all utility functions used by the chat component.

**Exported Functions:**

1. **Message Transformation:**
   - `transformMessagePart()`: Transforms individual message parts
   - `transformUserMessage()`: Transforms user messages for API format

2. **Route Context:**
   - `buildRouteContext()`: Builds API context from route information
   - `getModelDisplayNameFromContext()`: Gets display name from route context
   - `getContextSuggestions()`: Gets context-aware suggestions
   - `getInputPlaceholder()`: Gets dynamic placeholder text

3. **File Handling:**
   - `readFileAsDataURL()`: Converts file to data URL
   - `buildFileParts()`: Builds message parts array from files

4. **UI Utilities:**
   - `getInputPaddingClasses()`: Gets padding classes based on sidebar mode

## 🔄 Data Flow

### Message Submission Flow

```
User Input/File Selection
    ↓
submitMessageWithAttachments()
    ↓
buildFileParts() [if files selected]
    ↓
append() [useChat hook]
    ↓
experimental_prepareRequestBody()
    ↓
transformUserMessage() [for user messages]
    ↓
API Request to /api/agent/chat/stream
    ↓
Streaming Response
    ↓
onFinish() callback
    ↓
Process Tool Invocations
    ↓
Update UI & Context
```

### Message Transformation Flow

```
User Message (from UI)
    ↓
{ role: 'user', content: string, parts?: MessagePart[] }
    ↓
transformUserMessage()
    ↓
If has parts → transformMessagePart() for each part
If no parts → create parts array from content string
    ↓
{ role: 'user', content: MessagePart[], parts: MessagePart[] }
    ↓
API Request
```

### Context Flow

```
URL Pathname (/purchase_order/po_123/state/Draft)
    ↓
extractRouteContext() [routeUtils]
    ↓
currentRouteContext { modelName, recordId, stateId, viewId }
    ↓
buildRouteContext() [chatUtils]
    ↓
API Context {
    modelName: 'purchase_order',
    viewName: 'purchase_order',
    recordId: 'po_123',
    stateId: 'Draft',
    modelDisplayName: 'Purchase Order',
    currentPath: '/purchase_order/po_123/state/Draft'
}
    ↓
Sent in API request body.context
```

## 🎯 Context-Aware Chat

The chat system is context-aware, meaning it understands the current page/route and adjusts its behavior accordingly.

### How Context Works

1. **Route Extraction:**
   - The component uses `extractRouteContext()` from `routeUtils` to parse the URL
   - Extracts: `modelName`, `recordId`, `stateId`, `viewId`

2. **Context Building:**
   - `buildRouteContext()` transforms route context into API format
   - Special handling for:
     - `dashboard` → converts to `default` model
     - `purchase_requisition` → uses `view_1` view

3. **Context Usage:**
   - Sent to backend in request `body.context`
   - Used for dynamic UI (suggestions, placeholders)
   - Displayed to user in context info banner

### Context-Aware Features

**Dynamic Suggestions:**
```typescript
// On dashboard or non-state route:
["Show recent purchase orders", "Show spend by department", ...]

// On state-based route (e.g., viewing an invoice):
["Show details for this invoice", 
 "What actions can I take on this invoice?",
 "Explain the current status",
 "Show related records"]
```

**Dynamic Placeholders:**
```typescript
// Dashboard: "Ask anything"
// Invoice page: "Ask about this invoice"
// Purchase Order: "Ask about this purchase order"
```

**Context Info Display:**
- Shows current context in a blue banner
- Displays: Model Name, State ID, View ID (if available)

## 📨 Message Transformation

Messages need to be transformed before sending to the API to ensure proper format.

### Message Parts Structure

```typescript
type MessagePart =
    | { type: 'text'; text: string }
    | { type: 'file'; data: string; mimeType: string; mediaType?: string }
    | Record<string, unknown>;
```

### Transformation Process

1. **User Messages with Parts:**
   - Transforms each part using `transformMessagePart()`
   - Ensures `mediaType` is set for file parts
   - Returns message with `content` as array of parts

2. **User Messages without Parts:**
   - Extracts text content
   - Creates parts array with single text part
   - Keeps content as string for backward compatibility

3. **Non-User Messages:**
   - Returned as-is (no transformation needed)

## 📎 File Attachments

The chat supports file attachments (images, documents, etc.).

### File Handling Flow

```
User clicks "Plus" button
    ↓
handleFilePickerClick()
    ↓
File input dialog opens
    ↓
User selects files
    ↓
handleFileSelection()
    ↓
Files stored in selectedFiles state
    ↓
Files displayed as chips (renderSelectedFileChips)
    ↓
On submit: buildFileParts()
    ↓
readFileAsDataURL() for each file
    ↓
Convert to MessagePart format
    ↓
Append to message parts array
    ↓
Sent to API
```

### File Part Format

```typescript
{
    type: 'file',
    data: string,           // Base64 data URL
    mimeType: string,       // File MIME type
    mediaType: string       // Same as mimeType (for compatibility)
}
```

## 🛠️ Tool Invocations

The AI can invoke tools to perform actions or display data.

### Tool Invocation Flow

```
AI Response with toolInvocations
    ↓
onFinish() callback in useChat
    ↓
For each tool with state === 'result':
    ↓
addToolData() → Updates ToolContext
    ↓
handleToolResponse() → Handles redirects/actions
    ↓
ToolResponseRenderer → Displays tool results in UI
```

### Tool Processing

**In `onFinish` callback:**
```typescript
// 1. Extract tool invocations from message
// 2. Add tool data to ToolContext for global state
// 3. Handle tool responses (e.g., redirect to new record)
// 4. UI automatically renders tool results via ToolResponseRenderer
```

**Tool Result Rendering:**
- `ToolResponseRenderer` component handles rendering different tool types
- Supports: Invoice mapping, SQL results, metrics display, etc.
- Located in `tool-responses/` directory

## 💡 Usage Examples

### Basic Usage

```tsx
import { ChatUI } from '@/components/chat/ChatUI';

function MyPage() {
    return (
        <div>
            <ChatUI />
        </div>
    );
}
```

### With Sidebar Mode

```tsx
<ChatUI sidebarMode={true} />
```

### Using Chat Utils

```typescript
import { 
    buildRouteContext, 
    transformUserMessage,
    getContextSuggestions 
} from '@/components/chat/chatUtils';

// Build route context
const context = buildRouteContext(routeContext, pathname);

// Transform message
const transformed = transformUserMessage(userMessage);

// Get suggestions
const suggestions = getContextSuggestions(isStateRoute, modelDisplayName);
```

## 🔑 Important Concepts

### 1. Message Synchronization

Messages are synchronized between:
- **`useChat` hook**: Manages messages from the API stream
- **`ChatContext`**: Persists messages across components/navigation

**Sync Flow:**
```typescript
// Load from context on mount
useEffect(() => {
    if (messagesAi.length > 0 && messages.length === 0) {
        setMessages(messagesAi);
    }
}, [messagesAi, messages.length, setMessages]);

// Save to context on change
useEffect(() => {
    setMessagesAi(messages);
}, [messages, setMessagesAi]);
```

### 2. Route Context Sync

Route context is synchronized between:
- **Current route** (from `location.pathname`)
- **ChatContext** (for persistence)
- **API context** (sent to backend)

**Sync Flow:**
```typescript
// Extract from route
const currentRouteContext = useMemo(
    () => extractRouteContext(location.pathname), 
    [location.pathname]
);

// Sync to ChatContext
useEffect(() => {
    if (isStateRoute) {
        setRouteContext(currentRouteContext);
    } else {
        setRouteContext(null);
    }
}, [isStateRoute, currentRouteContext, setRouteContext]);

// Build for API
const apiContext = useMemo(() => {
    if (!isStateRoute || !currentRouteContext) return undefined;
    return buildRouteContext(currentRouteContext, location.pathname);
}, [isStateRoute, currentRouteContext, location.pathname]);
```

### 3. Request Body Transformation

The `experimental_prepareRequestBody` hook transforms all messages before sending:

```typescript
experimental_prepareRequestBody: ({ id, messages, requestBody }) => {
    const transformedMessages = messages.map(message => {
        if (message.role === 'user') {
            return transformUserMessage(message as UserMessage);
        }
        return message;
    });

    return {
        id,
        ...requestBody,
        stream: true,
        messages: transformedMessages
    };
}
```

### 4. Empty State vs Active Chat

**Empty State (no messages):**
- Centered layout
- Welcome message: "What can I help with?"
- Suggestions displayed as chips
- Context info banner (if applicable)
- Full-width input at center

**Active Chat (has messages):**
- Header with status indicator and actions
- Scrollable message list
- Input at bottom
- Context info banner at top (if applicable)

### 5. Streaming Status

The `status` from `useChat` controls UI behavior:
- `'streaming'`: Shows stop button, loading indicator
- `'idle'`: Shows regenerate button (if messages exist)
- Disables input during streaming

### 6. API Configuration

**Endpoint:**
```
${VITE_API_BASE_URL || 'http://localhost:4000'}/api/agent/chat/stream
```

**Headers:**
```typescript
{
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${token}`
}
```

**Body:**
```typescript
{
    stream: true,
    context: RouteContext | undefined,  // If on state-based route
    messages: TransformedMessage[]
}
```

## 📝 Type Definitions

### Message Types

```typescript
interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'data';
    content: string;
    toolInvocations?: ToolInvocation[];
}

interface UserMessage {
    role: 'user';
    content?: string | MessagePart[];
    parts?: MessagePart[];
}

type MessagePart =
    | { type: 'text'; text: string }
    | { type: 'file'; data: string; mimeType: string; mediaType?: string }
    | Record<string, unknown>;
```

### Route Context Types

```typescript
interface RouteContext {
    modelName: string;
    viewName: string;
    recordId?: string | null;
    stateId?: string | null;
    viewId?: string | null;
    modelDisplayName: string | null;
    currentPath: string;
}
```

## 🔍 Debugging Tips

1. **Check console logs:**
   - "Stream started:" - When API stream begins
   - "Chat finished with final message:" - When stream completes
   - "Files selected:" - When files are chosen

2. **Verify context:**
   - Check `currentRouteContext` in component
   - Verify `apiContext` is built correctly
   - Ensure context is sent in request body

3. **Message transformation:**
   - Verify messages are transformed correctly in `experimental_prepareRequestBody`
   - Check that file parts have correct structure

4. **Tool invocations:**
   - Check `toolInvocations` array in finished message
   - Verify tool data is added to ToolContext
   - Check if redirects are handled correctly

## 🚀 Future Enhancements

Potential improvements:
- Voice input support (Mic button currently non-functional)
- Message editing
- Message deletion
- Export chat history
- Share chat conversations
- Multiple chat sessions
- Custom tool response renderers

## 📚 Related Files

- **Contexts:**
  - `src/contexts/ChatContext.tsx` - Chat state management
  - `src/contexts/ToolContext.tsx` - Tool data management

- **Utils:**
  - `src/utils/routeUtils.ts` - Route parsing utilities
  - `src/components/utils/helper.ts` - Tool response handling

- **Hooks:**
  - `@ai-sdk/react` - `useChat` hook for streaming chat

## 📖 Additional Resources

- [AI SDK Documentation](https://sdk.vercel.ai/docs)
- Tool Response Renderers: See `tool-responses/README.md`
- Route Utils: See `src/utils/routeUtils.ts` documentation

