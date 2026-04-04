import React from 'react';
import { cn } from '@/lib/utils';

interface HtmlPreviewProps {
    html: string;
    className?: string;
    title?: string;
}

const HtmlPreview: React.FC<HtmlPreviewProps> = ({
    html,
    className,
    title = "Prompt Preview"
}) => {
    if (!html || html.trim() === '') {
        return (
            <div className={cn('border border-gray-200 rounded-lg bg-gray-50 p-4', className)}>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                    {title}
                </h3>
                <div className="text-gray-500 text-sm italic">No content to preview</div>
            </div>
        );
    }

    // Process HTML to enhance variable styling
    const processedHtml = html.replace(
        /<span class="variable"[^>]*>(\{\{[^}]+\}\})<\/span>/g,
        '<span class="variable-preview">$1</span>'
    );

    return (
        <div className={cn('border border-gray-200 rounded-lg bg-white shadow-sm', className)}>
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3">
                <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    {title}
                </h3>
            </div>
            <div className="p-4">
                <div
                    className="prose prose-sm max-w-none
                        prose-headings:font-semibold prose-headings:text-gray-900 prose-headings:mb-3
                        prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-2
                        prose-strong:text-gray-900 prose-strong:font-semibold
                        prose-code:bg-gray-100 prose-code:text-gray-800 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-mono
                        prose-blockquote:border-l-4 prose-blockquote:border-blue-200 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:bg-blue-50 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r
                        prose-ul:list-disc prose-ol:list-decimal prose-ul:pl-6 prose-ol:pl-6
                        prose-li:marker:text-gray-400 prose-li:mb-1
                        prose-a:text-blue-600 prose-a:underline prose-a:decoration-blue-300
                        [&_.variable-preview]:bg-yellow-100 [&_.variable-preview]:text-yellow-800 [&_.variable-preview]:px-2 [&_.variable-preview]:py-1 [&_.variable-preview]:rounded [&_.variable-preview]:font-mono [&_.variable-preview]:text-sm [&_.variable-preview]:border [&_.variable-preview]:border-yellow-200"
                    dangerouslySetInnerHTML={{ __html: processedHtml }}
                />
            </div>
        </div>
    );
};

export { HtmlPreview }; 