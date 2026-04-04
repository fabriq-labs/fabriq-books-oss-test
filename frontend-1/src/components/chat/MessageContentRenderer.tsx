import React from 'react';
import { Package, FileText, DollarSign, Building2 } from 'lucide-react';

interface MessageContentRendererProps {
    content: string;
}

interface StructuredItem {
    [key: string]: string;
}

/**
 * Parses structured data from messages and renders them in a user-friendly card format
 * Handles patterns like: "PO Number: PO000002, PR Number: PR000002, Total Price: 102500000, Supplier: Dell Technologies"
 */
export const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({ content }) => {
    // Parse structured data items (key-value pairs separated by commas)
    const parseStructuredData = (text: string): StructuredItem[] => {
        const items: StructuredItem[] = [];
        
        // First, try to find multiple records by looking for repeated patterns
        // Split by sentences or newlines that might separate records
        const sentences = text.split(/[.\n]/).map(s => s.trim()).filter(s => s.length > 0);
        
        for (const sentence of sentences) {
            // Check if this sentence contains key-value pairs
            const pairs = sentence.split(',').map(p => p.trim());
            const item: StructuredItem = {};
            let pairCount = 0;
            
            for (const pair of pairs) {
                const colonIndex = pair.indexOf(':');
                if (colonIndex > 0) {
                    const key = pair.substring(0, colonIndex).trim();
                    const value = pair.substring(colonIndex + 1).trim();
                    // Validate: key should be reasonable length and value should exist
                    if (key && value && key.length < 60 && value.length < 200) {
                        item[key] = value;
                        pairCount++;
                    }
                }
            }
            
            // If we found at least 2 key-value pairs, it's likely structured data
            if (pairCount >= 2) {
                items.push(item);
            }
        }
        
        // If no structured records found in sentences, try parsing the entire content
        if (items.length === 0) {
            const item: StructuredItem = {};
            // Split by comma, but be smart about it
            const parts = text.split(',').map(p => p.trim());
            let pairCount = 0;
            
            for (const part of parts) {
                const colonIndex = part.indexOf(':');
                if (colonIndex > 0) {
                    const key = part.substring(0, colonIndex).trim();
                    const value = part.substring(colonIndex + 1).trim();
                    if (key && value && key.length < 60 && value.length < 200) {
                        item[key] = value;
                        pairCount++;
                    }
                }
            }
            
            // If we found at least 2 key-value pairs, treat as structured data
            if (pairCount >= 2) {
                items.push(item);
            }
        }
        
        return items;
    };

    // Check if content contains structured data
    const structuredItems = parseStructuredData(content);
    const hasStructuredData = structuredItems.length > 0;

    // Extract non-structured text (introductory text before the data)
    const extractIntroText = (text: string): string => {
        if (!hasStructuredData) return text;
        
        // Find where the first key-value pair starts
        // Look for pattern like "Text: Value" where Text is a reasonable key
        const firstKeyValueMatch = text.match(/([A-Za-z][^:]{0,50}):\s*([^,]+)/);
        if (!firstKeyValueMatch) return '';
        
        const matchIndex = firstKeyValueMatch.index || 0;
        const beforeData = text.substring(0, matchIndex).trim();
        
        // Clean up common prefixes and return if it's meaningful
        const cleaned = beforeData
            .replace(/^(Here are|Here is|These are|This is|The following|List of)/i, '')
            .trim()
            .replace(/^[:\s,]+/, '')
            .trim();
        
        if (cleaned.length > 0 && cleaned.length < 150) {
            return cleaned;
        }
        
        return '';
    };

    const introText = extractIntroText(content);

    // Get icon for field type
    const getFieldIcon = (key: string) => {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('po') || lowerKey.includes('purchase order')) {
            return <Package className="h-4 w-4" />;
        }
        if (lowerKey.includes('pr') || lowerKey.includes('requisition')) {
            return <FileText className="h-4 w-4" />;
        }
        if (lowerKey.includes('price') || lowerKey.includes('total') || lowerKey.includes('amount') || lowerKey.includes('cost')) {
            return <DollarSign className="h-4 w-4" />;
        }
        if (lowerKey.includes('supplier') || lowerKey.includes('vendor') || lowerKey.includes('company')) {
            return <Building2 className="h-4 w-4" />;
        }
        return null;
    };

    // Format value (add commas to numbers, etc.)
    const formatValue = (value: string): string => {
        // Check if it's a number
        const numValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
        if (!isNaN(numValue) && value.match(/^\d+$/)) {
            return numValue.toLocaleString();
        }
        return value;
    };

    return (
        <div className="space-y-3">
            {/* Render intro text if present */}
            {introText && (
                <div className="text-gray-900 whitespace-pre-wrap leading-relaxed mb-3">
                    {introText}
                </div>
            )}
            
            {/* Render structured data as cards */}
            {hasStructuredData && (
                <div className="space-y-3 -mx-1">
                    {structuredItems.map((item, itemIndex) => (
                        <div
                            key={itemIndex}
                            className="rounded-lg border border-gray-200 bg-gradient-to-br from-white to-gray-50/50 p-4 shadow-sm hover:shadow-md transition-all hover:border-gray-300"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {Object.entries(item).map(([key, value], index) => {
                                    const icon = getFieldIcon(key);
                                    return (
                                        <div key={index} className="flex items-start gap-2.5 group">
                                            {icon && (
                                                <div className="mt-0.5 text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors">
                                                    {icon}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                                    {key}
                                                </div>
                                                <div className="text-sm font-semibold text-gray-900 break-words leading-relaxed">
                                                    {formatValue(value)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {/* Fallback: if no structured data detected, render as regular text */}
            {!hasStructuredData && !introText && (
                <div className="text-gray-900 whitespace-pre-wrap leading-relaxed">
                    {content}
                </div>
            )}
        </div>
    );
};

