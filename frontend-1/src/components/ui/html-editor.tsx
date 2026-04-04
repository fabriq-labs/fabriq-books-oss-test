import React, { useRef, useEffect, useState } from 'react';
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    AlignLeft,
    AlignCenter,
    AlignRight,
    List,
    ListOrdered,
    Quote,
    Heading1,
    Heading2,
    Heading3,
    Link,
    Unlink,
    Type,
    Palette,
    ChevronDown,
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface HTMLEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    autoResize?: boolean;
    minHeight?: number;
    maxHeight?: number;
}

const HTMLEditor: React.FC<HTMLEditorProps> = ({
    value,
    onChange,
    placeholder = 'Enter your prompt template here...',
    className,
    autoResize = true,
    minHeight = 200,
    maxHeight = 600,
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [editorHeight, setEditorHeight] = useState(minHeight);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    useEffect(() => {
        if (autoResize && editorRef.current) {
            const resizeObserver = new ResizeObserver(() => {
                if (editorRef.current) {
                    const scrollHeight = editorRef.current.scrollHeight;
                    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
                    setEditorHeight(newHeight);
                }
            });

            resizeObserver.observe(editorRef.current);
            return () => resizeObserver.disconnect();
        }
    }, [autoResize, minHeight, maxHeight]);

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    };

    const execCommand = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        handleInput();
    };

    const insertHTML = (html: string) => {
        document.execCommand('insertHTML', false, html);
        editorRef.current?.focus();
        handleInput();
    };

    const getSelection = () => {
        return window.getSelection();
    };

    const isActive = (command: string, value?: string) => {
        return document.queryCommandState(command);
    };

    const handleLink = () => {
        const url = prompt('Enter URL:');
        if (url) {
            execCommand('createLink', url);
        }
    };

    const removeLink = () => {
        execCommand('unlink');
    };

    const insertVariable = (variable: string) => {
        insertHTML(`<span class="variable" style="background-color: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace;">{{${variable}}}</span>`);
    };

    const changeTextColor = (color: string) => {
        execCommand('foreColor', color);
    };

    const predefinedColors = [
        { name: 'Default', value: '#000000' },
        { name: 'Red', value: '#dc2626' },
        { name: 'Orange', value: '#ea580c' },
        { name: 'Yellow', value: '#ca8a04' },
        { name: 'Green', value: '#16a34a' },
        { name: 'Blue', value: '#2563eb' },
        { name: 'Purple', value: '#7c3aed' },
        { name: 'Pink', value: '#db2777' },
        { name: 'Gray', value: '#6b7280' },
        { name: 'Brown', value: '#a16207' },
        { name: 'Light Blue', value: '#0ea5e9' },
        { name: 'Light Green', value: '#22c55e' },
    ];

    return (
        <div className={cn('border border-gray-200 rounded-lg bg-white shadow-sm transition-all duration-200 hover:shadow-md', className)}>
            {/* Compact Toolbar */}
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100 p-3 flex flex-wrap items-center gap-1">
                {/* Text Formatting */}
                <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('bold') ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('bold')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <Bold className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Bold (Ctrl+B)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('italic') ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('italic')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <Italic className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Italic (Ctrl+I)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('underline') ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('underline')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <Underline className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Underline (Ctrl+U)</TooltipContent>
                    </Tooltip>
                </div>

                {/* Headings */}
                <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('formatBlock') && getSelection()?.toString().match(/^h1$/i) ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('formatBlock', '<h1>')}
                                className="h-8 px-2 text-xs font-semibold hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                H1
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Heading 1</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('formatBlock') && getSelection()?.toString().match(/^h2$/i) ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('formatBlock', '<h2>')}
                                className="h-8 px-2 text-xs font-semibold hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                H2
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Heading 2</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('formatBlock') && getSelection()?.toString().match(/^h3$/i) ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('formatBlock', '<h3>')}
                                className="h-8 px-2 text-xs font-semibold hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                H3
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Heading 3</TooltipContent>
                    </Tooltip>
                </div>

                {/* Lists and Structure */}
                <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('insertUnorderedList') ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('insertUnorderedList')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Bullet List</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('insertOrderedList') ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('insertOrderedList')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <ListOrdered className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Numbered List</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('formatBlock') && getSelection()?.toString().match(/^blockquote$/i) ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('formatBlock', '<blockquote>')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <Quote className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Quote Block</TooltipContent>
                    </Tooltip>
                </div>

                {/* Code and Variables */}
                <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => insertHTML('<code class="bg-gray-100 px-2 py-1 rounded text-sm font-mono">code</code>')}
                                className="h-8 px-2 text-xs hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <Code className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Code</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => insertVariable('variable_name')}
                                className="h-8 px-2 text-xs hover:bg-yellow-50 hover:text-yellow-600 transition-colors"
                            >
                                <Type className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Insert Variable</TooltipContent>
                    </Tooltip>
                </div>

                {/* Text Color */}
                <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                    >
                                        <Palette className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Text Color</TooltipContent>
                            </Tooltip>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="start">
                            <div className="space-y-3">
                                <h4 className="text-sm font-medium text-gray-900">Text Color</h4>
                                <div className="grid grid-cols-4 gap-2">
                                    {predefinedColors.map((color) => (
                                        <Button
                                            key={color.value}
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => changeTextColor(color.value)}
                                            className="h-8 w-full p-1 hover:bg-gray-100 transition-colors"
                                            style={{
                                                backgroundColor: color.value === '#000000' ? '#ffffff' : color.value,
                                                border: color.value === '#000000' ? '1px solid #d1d5db' : 'none',
                                                color: color.value === '#000000' ? '#000000' : '#ffffff'
                                            }}
                                        >
                                            <span className="text-xs font-medium">{color.name}</span>
                                        </Button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        onChange={(e) => changeTextColor(e.target.value)}
                                        className="h-8 w-16 rounded border border-gray-300 cursor-pointer"
                                        defaultValue="#000000"
                                    />
                                    <span className="text-xs text-gray-500">Custom color</span>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Text Alignment */}
                <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('justifyLeft') ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('justifyLeft')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <AlignLeft className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Align Left</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('justifyCenter') ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('justifyCenter')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <AlignCenter className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Align Center</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isActive('justifyRight') ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => execCommand('justifyRight')}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <AlignRight className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Align Right</TooltipContent>
                    </Tooltip>
                </div>

                {/* Links */}
                <div className="flex items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleLink}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                <Link className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Insert Link</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={removeLink}
                                className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                                <Unlink className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove Link</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Editor Content */}
            <div className="p-4">
                <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className={cn(
                        'prose prose-sm max-w-none focus:outline-none transition-all duration-200',
                        'prose-headings:font-semibold prose-headings:text-gray-900',
                        'prose-p:text-gray-700 prose-p:leading-relaxed',
                        'prose-strong:text-gray-900 prose-strong:font-semibold',
                        'prose-code:bg-gray-100 prose-code:text-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm',
                        'prose-blockquote:border-l-4 prose-blockquote:border-blue-200 prose-blockquote:pl-4 prose-blockquote:italic',
                        'prose-ul:list-disc prose-ol:list-decimal',
                        'prose-li:marker:text-gray-400',
                        !value && 'before:content-[attr(data-placeholder)] before:text-gray-400 before:pointer-events-none before:absolute before:top-4 before:left-4',
                        isFocused && 'ring-2 ring-blue-200 ring-opacity-50'
                    )}
                    data-placeholder={placeholder}
                    style={{
                        minHeight: `${minHeight}px`,
                        maxHeight: autoResize ? `${maxHeight}px` : 'none',
                        height: autoResize ? `${editorHeight}px` : 'auto',
                        outline: 'none',
                        overflowY: autoResize ? 'auto' : 'visible',
                    }}
                />
            </div>

            {/* Character Count */}
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500 flex justify-between items-center">
                <span>Characters: {value.replace(/<[^>]*>/g, '').length}</span>
                <span className="text-xs text-gray-400">HTML Editor</span>
            </div>
        </div>
    );
};

export { HTMLEditor }; 