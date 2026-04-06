import React from 'react';
import {
    FileText,
    FileImage,
    FileSpreadsheet,
    File,
    Download,
    FileCode,
    Video,
    Music,
    Presentation
} from 'lucide-react';
import { MessagePart } from './chatUtils';

interface FileAttachmentProps {
    parts: MessagePart[];
}

/**
 * Gets the appropriate icon for a file type based on MIME type
 */
const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
        return FileImage;
    }
    if (mimeType === 'application/pdf') {
        return FileText;
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword' ||
        mimeType === 'application/vnd.ms-word'
    ) {
        return FileText;
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        mimeType === 'application/vnd.ms-excel.sheet.macroEnabled.12'
    ) {
        return FileSpreadsheet;
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mimeType === 'application/vnd.ms-powerpoint'
    ) {
        return Presentation;
    }
    if (mimeType.startsWith('video/')) {
        return Video;
    }
    if (mimeType.startsWith('audio/')) {
        return Music;
    }
    if (
        mimeType.startsWith('text/') ||
        mimeType === 'application/json' ||
        mimeType === 'application/javascript' ||
        mimeType === 'application/xml'
    ) {
        return FileCode;
    }
    return File;
};

/**
 * Gets the icon background color based on file type (ChatGPT style)
 */
const getIconBgColor = (mimeType: string): string => {
    if (mimeType === 'application/pdf') {
        return 'bg-red-500'; // Red for PDF like ChatGPT
    }
    if (mimeType.startsWith('image/')) {
        return 'bg-blue-500';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
    ) {
        return 'bg-blue-600';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel'
    ) {
        return 'bg-green-600';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mimeType === 'application/vnd.ms-powerpoint'
    ) {
        return 'bg-orange-500';
    }
    return 'bg-gray-500';
};

/**
 * Gets a human-readable file type label
 */
const getFileTypeLabel = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) {
        return 'Image';
    }
    if (mimeType === 'application/pdf') {
        return 'PDF';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword' ||
        mimeType === 'application/vnd.ms-word'
    ) {
        return 'Word Document';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        mimeType === 'application/vnd.ms-excel.sheet.macroEnabled.12'
    ) {
        return 'Excel Spreadsheet';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mimeType === 'application/vnd.ms-powerpoint'
    ) {
        return 'PowerPoint';
    }
    if (mimeType.startsWith('video/')) {
        return 'Video';
    }
    if (mimeType.startsWith('audio/')) {
        return 'Audio';
    }
    if (mimeType.startsWith('text/')) {
        return 'Text File';
    }
    return 'File';
};

/**
 * Formats file size for display
 */
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Estimates file size from data URL
 */
const estimateFileSize = (dataUrl: string): number => {
    // Approximate: base64 is about 4/3 the size of the original
    const base64Data = dataUrl.split(',')[1] || '';
    return Math.round((base64Data.length * 3) / 4);
};

export const FileAttachment: React.FC<FileAttachmentProps> = ({ parts }) => {
    if (!parts || parts.length === 0) return null;

    const fileParts = parts.filter(part => part.type === 'file');
    if (fileParts.length === 0) return null;

    return (
        <div className="space-y-2">
            {fileParts.map((part, idx) => {
                if (part.type !== 'file') return null;

                const mimeType =
                    (typeof part.mimeType === 'string' ? part.mimeType : null) ||
                    (typeof part.mediaType === 'string' ? part.mediaType : null) ||
                    'application/octet-stream';
                const dataUrl = typeof part.data === 'string' ? part.data : null;
                const fileName =
                    (typeof part === 'object' &&
                        part !== null &&
                        'name' in part &&
                        typeof part.name === 'string')
                        ? part.name
                        : `File ${idx + 1}`;
                const isImage = mimeType.startsWith('image/');
                const FileIcon = getFileIcon(mimeType);
                const fileTypeLabel = getFileTypeLabel(mimeType);
                const fileSize = dataUrl ? estimateFileSize(dataUrl) : 0;

                // Render image files (show preview with compact info)
                if (isImage && dataUrl) {
                    return (
                        <div
                            key={idx}
                            className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 max-w-md"
                        >
                            <div className="relative">
                                <img
                                    src={dataUrl}
                                    alt={fileName}
                                    className="max-w-full h-auto block"
                                    style={{ maxHeight: '300px', objectFit: 'contain' }}
                                />
                            </div>
                            {/* Compact file info bar */}
                            <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center shrink-0">
                                        <FileImage className="h-3.5 w-3.5 text-white" />
                                    </div>
                                    <span className="text-sm text-gray-700 truncate">{fileName}</span>
                                </div>
                                <a
                                    href={dataUrl}
                                    download={fileName}
                                    className="text-gray-400 hover:text-gray-600 shrink-0 ml-2"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Download className="h-4 w-4" />
                                </a>
                            </div>
                        </div>
                    );
                }

                // Render non-image files (ChatGPT style - compact)
                const iconBgColor = getIconBgColor(mimeType);

                return (
                    <div
                        key={idx}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors max-w-md"
                    >
                        {/* File icon with colored background */}
                        <div className="flex-shrink-0">
                            <div className={`w-8 h-8 rounded ${iconBgColor} flex items-center justify-center`}>
                                <FileIcon className="h-4 w-4 text-white" />
                            </div>
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate mb-0.5">
                                {fileName}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <span>{fileTypeLabel}</span>
                                {fileSize > 0 && (
                                    <>
                                        <span>•</span>
                                        <span>{formatFileSize(fileSize)}</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Download button */}
                        {dataUrl && (
                            <a
                                href={dataUrl}
                                download={fileName}
                                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                                title="Download file"
                            >
                                <Download className="h-4 w-4" />
                            </a>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

