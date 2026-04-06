# Message Processing Utilities

This directory contains utilities for processing messages between the frontend and the AI SDK.

## Overview

The frontend sends messages with file attachments as **base64-encoded strings** (required for JSON/HTTP), but the Vercel AI SDK requires file data as **Uint8Array** (binary format). This utility handles the conversion automatically.

## Why This Conversion is Necessary

### Frontend Constraints
- JSON cannot serialize binary data types (`Uint8Array`, `Buffer`, `ArrayBuffer`)
- HTTP with `Content-Type: application/json` only supports text-based JSON
- Files must be encoded as base64 strings for transport

### AI SDK Requirements
- The Vercel AI SDK requires file data as `Uint8Array` for processing
- Binary data is more efficient than base64 strings
- Direct binary access is needed for AI model integration

### Solution
**Frontend** → Sends base64 strings (required)  
**Backend Utility** → Converts base64 → Uint8Array (automatic)  
**AI SDK** → Receives Uint8Array (required)

## Files

### `messageProcessor.ts`

Main utility for processing messages and converting file data.

#### Main Functions

##### `processMessages(messages: RawMessage[]): ProcessedMessage[]`

Processes an array of messages, converting base64 file data to Uint8Array.

**Parameters:**
- `messages` - Array of raw messages from frontend

**Returns:**
- Array of processed messages ready for AI SDK

**Example:**
```typescript
const rawMessages = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Hello' },
      { 
        type: 'file', 
        data: 'data:application/pdf;base64,JVBERi0...',
        mimeType: 'application/pdf'
      }
    ]
  }
];

const processed = processMessages(rawMessages);
// processed[0].content[1].data is now Uint8Array
```

**What it does:**
- Filters invalid messages
- Converts base64 file data → Uint8Array
- Keeps text parts unchanged
- Simplifies single text part to string
- Handles string-only messages

## Type Definitions

### `RawMessage`
Message format from frontend (before processing):
```typescript
{
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<RawTextPart | RawFilePart>;
  // ... other properties like id, createdAt, etc.
}
```

### `ProcessedMessage`
Message format for AI SDK (after processing):
```typescript
{
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<TextPart | FilePart>;
}
```

### `RawFilePart`
File part from frontend (base64 string):
```typescript
{
  type: 'file' | 'image';
  data: string; // Base64 data URI or plain base64
  mimeType?: string;
  mediaType?: string; // Alias for mimeType
  name?: string;
}
```

### `FilePart`
File part for AI SDK (Uint8Array):
```typescript
{
  type: 'file' | 'image';
  data: Uint8Array; // Binary data
  mimeType?: string;
  name?: string;
}
```

## Supported File Data Formats

The utility accepts file data in multiple formats:

### 1. Base64 Data URI (Recommended)
```
data:application/pdf;base64,JVBERi0xLjQK...
```
- Includes MIME type
- Self-contained format
- Automatically parsed

### 2. Plain Base64 String
```
JVBERi0xLjQK...
```
- Requires `mimeType` parameter
- More compact

### 3. Already Binary (Pass-through)
- `Uint8Array` → Used as-is
- `Buffer` → Converted to Uint8Array
- `ArrayBuffer` → Converted to Uint8Array

## Error Handling

- **Invalid base64 data**: Throws error with descriptive message
- **Unsupported format**: Throws error listing supported formats
- **File part processing fails**: Logs warning and skips the part (doesn't break the message)
- **Missing MIME type**: Generates default name based on MIME type, or timestamp-based name

## Usage in AgentService

```typescript
import { processMessages } from './utils/messageProcessor';

// In handleStreamingRequest:
const allMessages = [...previousMessages, message];
const processedMessages = processMessages(allMessages);

// Use processedMessages with AI SDK
const result = streamText({
  model: google(...),
  messages: processedMessages,
  // ...
});
```

## Frontend Message Format

The frontend should send messages in this format:

```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Hello, please process this invoice"
    },
    {
      "type": "file",
      "data": "data:application/pdf;base64,JVBERi0xLjQK...",
      "mimeType": "application/pdf"
    }
  ]
}
```

**Note:** The `data` field must be a base64 string. Do not try to send `Uint8Array` directly - it cannot be serialized in JSON.

## Performance Considerations

- Base64 encoding adds ~33% size overhead
- Conversion happens in memory (fast)
- Large files (100+ MB) may take a moment to convert
- Processing is done synchronously in the request handler

## Testing

To test the utility:

```typescript
import { processMessages } from './utils/messageProcessor';

const testMessage = {
  role: 'user' as const,
  content: [
    { type: 'text', text: 'Test message' },
    { 
      type: 'file', 
      data: 'data:text/plain;base64,SGVsbG8gV29ybGQ=', // "Hello World" in base64
      mimeType: 'text/plain'
    }
  ]
};

const processed = processMessages([testMessage]);
console.log(processed[0].content); // Should have Uint8Array in file part
```

## Migration Notes

If you previously handled message processing manually:

1. **Remove custom base64 conversion code** - Now handled automatically
2. **Use `processMessages()`** instead of manual processing
3. **Update type imports** - Import types from this utility

## Troubleshooting

### Error: "Invalid base64 file data"
- Check that base64 string is valid
- Ensure data URI format is correct: `data:mime/type;base64,<data>`
- Verify no extra whitespace or characters

### Error: "Unsupported file data format"
- Ensure file data is string (base64), Uint8Array, Buffer, or ArrayBuffer
- Check that you're not passing objects or other types

### File parts being skipped
- Check server logs for warnings
- Verify MIME type is provided
- Ensure base64 data is valid

### Type errors with AI SDK
- Use type assertion: `processedMessages as any`
- Ensure messages have correct `role` and `content` structure
- Check that file parts have `data` as `Uint8Array` (not string)

