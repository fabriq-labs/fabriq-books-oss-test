import { Buffer } from 'buffer';
import logger from '../../utils/logger';

/**
 * Core message types for AI SDK
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
export type ProcessedMessage = {
    role: MessageRole;
    content: string | Array<TextPart | FilePart>;
};

export type TextPart = {
    type: 'text';
    text: string;
};

export type FilePart = {
    type: 'file' | 'image';
    data: Uint8Array;
    mimeType?: string;
    name?: string;
};

/**
 * Raw message from frontend (before processing)
 */
export type RawMessage = {
    role: MessageRole;
    content: string | Array<RawTextPart | RawFilePart>;
    [key: string]: any; // Allow other properties like id, createdAt, etc.
};

export type RawTextPart = {
    type: 'text';
    text: string;
};

export type RawFilePart = {
    type: 'file' | 'image';
    data: string; // Base64 data URI or plain base64 string
    mimeType?: string;
    mediaType?: string; // Alias for mimeType
    name?: string;
};

/**
 * Parsed file data structure
 */
type ParsedFileData = {
    data: Uint8Array;
    mimeType?: string;
    name?: string;
};

/**
 * Processes messages to convert base64 file data → Uint8Array (required for AI SDK).
 * 
 * Frontend sends file data as base64 strings because JSON cannot serialize Uint8Array/Buffer.
 * This function converts the base64 data to Uint8Array before passing to the AI SDK.
 * 
 * @param messages - Array of raw messages from frontend
 * @returns Array of processed messages ready for AI SDK
 * 
 * @example
 * ```typescript
 * const rawMessages = [
 *   {
 *     role: 'user',
 *     content: [
 *       { type: 'text', text: 'Hello' },
 *       { type: 'file', data: 'data:application/pdf;base64,JVBERi0...', mimeType: 'application/pdf' }
 *     ]
 *   }
 * ];
 * 
 * const processed = processMessages(rawMessages);
 * // processed[0].content[1].data is now Uint8Array instead of string
 * ```
 */
export function processMessages(messages: RawMessage[]): ProcessedMessage[] {
    return messages
        .filter(msg => msg && typeof msg === 'object' && msg.role && msg.content)
        .map((msg) => {
            const role = msg.role as MessageRole;
            let content = msg.content;

            // If content is a string, return as-is
            if (typeof content === 'string') {
                return { role, content };
            }

            // If content is an array, process each part
            if (Array.isArray(content)) {
                const processedParts = content
                    .map((part) => processContentPart(part))
                    .filter((part): part is TextPart | FilePart => part !== null);

                // If single text part, simplify to string
                if (processedParts.length === 1 && processedParts[0]?.type === 'text') {
                    return { role, content: processedParts[0].text || '' };
                }

                return { role, content: processedParts };
            }

            return { role, content: content || '' };
        });
}

/**
 * Processes a single content part, converting file data if needed.
 * 
 * @param part - Raw content part from frontend
 * @returns Processed part ready for AI SDK, or null if invalid
 */
function processContentPart(part: any): TextPart | FilePart | null {
    if (!part || typeof part !== 'object') {
        return null;
    }

    // Text parts pass through unchanged
    if (part.type === 'text') {
        return {
            type: 'text',
            text: part.text ?? ''
        };
    }

    // File/image parts need base64 → Uint8Array conversion
    if (part.type === 'file' || part.type === 'image') {
        try {
            const fileData = parseFileData(
                part.data,
                part.mimeType || part.mediaType,
                part.name
            );

            return {
                type: part.type,
                data: fileData.data,
                mimeType: fileData.mimeType,
                name: fileData.name
            };
        } catch (error) {
            logger.warn('Failed to process file part, skipping', {
                error: (error as Error).message,
                partType: part.type
            });
            return null;
        }
    }

    // Unknown part type, skip it
    return null;
}

/**
 * Parses file data from various formats and converts to Uint8Array.
 * 
 * Supports:
 * - Base64 data URIs: "data:application/pdf;base64,JVBERi0..."
 * - Plain base64 strings: "JVBERi0..."
 * - Already converted Uint8Array/Buffer (passes through)
 * 
 * @param rawData - File data in various formats
 * @param mimeType - MIME type (optional, can be extracted from data URI)
 * @param providedName - File name (optional)
 * @returns Parsed file data with Uint8Array
 * 
 * @throws Error if data format is unsupported or invalid
 */
function parseFileData(
    rawData: unknown,
    mimeType?: string,
    providedName?: string
): ParsedFileData {
    // Already Uint8Array or Buffer, return as-is
    if (rawData instanceof Uint8Array || Buffer.isBuffer(rawData)) {
        return {
            data: rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData),
            mimeType,
            name: providedName
        };
    }

    // ArrayBuffer, convert to Uint8Array
    if (rawData instanceof ArrayBuffer) {
        return {
            data: new Uint8Array(rawData),
            mimeType,
            name: providedName
        };
    }

    // String (base64 data URI or plain base64)
    if (typeof rawData === 'string') {
        let base64String = rawData;
        let detectedMimeType = mimeType;

        // Extract mime type and base64 from data URI
        const dataUriMatch = rawData.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUriMatch) {
            detectedMimeType = detectedMimeType || dataUriMatch[1];
            base64String = dataUriMatch[2];
        }

        try {
            const buffer = Buffer.from(base64String, 'base64');
            return {
                data: buffer,
                mimeType: detectedMimeType,
                name: providedName || generateAttachmentName(detectedMimeType)
            };
        } catch (error) {
            throw new Error('Invalid base64 file data provided.');
        }
    }

    throw new Error('Unsupported file data format. Expected Uint8Array, Buffer, ArrayBuffer, or base64 string.');
}

/**
 * Generates a fallback file name for attachments when none is provided.
 * 
 * @param mimeType - MIME type to extract extension from
 * @returns Generated file name with timestamp
 * 
 * @example
 * ```typescript
 * generateAttachmentName('application/pdf'); // Returns: "attachment-1234567890.pdf"
 * generateAttachmentName(); // Returns: "attachment-1234567890"
 * ```
 */
function generateAttachmentName(mimeType?: string): string {
    if (!mimeType) {
        return `attachment-${Date.now()}`;
    }

    const extension = mimeType.split('/')[1] || 'bin';
    return `attachment-${Date.now()}.${extension}`;
}

