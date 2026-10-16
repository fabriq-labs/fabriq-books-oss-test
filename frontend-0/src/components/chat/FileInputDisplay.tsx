import React from 'react';
import { X } from 'lucide-react';
import {
    getFileIconForInput,
    getFileTypeLabelForInput,
    getIconBgColorForInput
} from './chatUtils';

interface FileInputDisplayProps {
    files: File[];
    onRemoveFile: (index: number) => void;
}

/**
 * Component to display selected files in the chat input area (ChatGPT style)
 * Shows files as cards above the input field with remove buttons
 */
export const FileInputDisplay: React.FC<FileInputDisplayProps> = ({
    files,
    onRemoveFile
}) => {
    if (files.length === 0) return null;

    return (
        <div className="px-4 pb-2 space-y-2">
            {files.map((file, index) => {
                const FileIcon = getFileIconForInput(file);
                const iconBgColor = getIconBgColorForInput(file);
                const fileTypeLabel = getFileTypeLabelForInput(file);

                return (
                    <div
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
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
                                {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                                {fileTypeLabel}
                            </p>
                        </div>

                        {/* Remove button */}
                        <button
                            type="button"
                            onClick={() => onRemoveFile(index)}
                            className="flex-shrink-0 w-6 h-6 rounded-full bg-black hover:bg-gray-800 flex items-center justify-center transition-colors"
                            title="Remove file"
                        >
                            <X className="h-3.5 w-3.5 text-white" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

