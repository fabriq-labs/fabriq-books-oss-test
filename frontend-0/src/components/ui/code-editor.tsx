import React, { useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
    placeholder?: string;
    className?: string;
    height?: string;
    readOnly?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
    value,
    onChange,
    language = 'json',
    placeholder = 'Enter code...',
    className,
    height = '400px',
    readOnly = false,
}) => {
    const editorRef = useRef<any>(null);
    const { resolvedTheme } = useTheme();
    const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs';

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;

        // Configure JSON language settings if language is json
        if (language === 'json') {
            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                validate: true,
                allowComments: false,
                schemas: [],
                enableSchemaRequest: false,
            });
        }

    };

    const handleEditorChange = (value: string | undefined) => {
        // Always call onChange, even if value is undefined (convert to empty string)
        onChange(value ?? '');
    };

    return (
        <div className={cn('border rounded-md overflow-hidden', className)}>
            <Editor
                height={height}
                language={language}
                value={value}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                theme={editorTheme}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    readOnly: readOnly,
                    automaticLayout: true,
                    tabSize: 2,
                    formatOnPaste: true,
                    formatOnType: true,
                    wordWrap: 'on',
                    folding: true,
                    bracketPairColorization: { enabled: true },
                    suggestOnTriggerCharacters: true,
                    acceptSuggestionOnEnter: 'on',
                    tabCompletion: 'on',
                    quickSuggestions: true,
                }}
                loading={
                    <div className="flex items-center justify-center h-full bg-gray-50">
                        <div className="text-sm text-gray-500">Loading editor...</div>
                    </div>
                }
            />
        </div>
    );
};

