/**
 * JsonPreviewPanel - Collapsible panel showing generated JSON
 *
 * Displays the datagraph JSON with syntax highlighting and copy functionality.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, X } from 'lucide-react';
import { JsonPreviewPanelProps } from './types';

export const JsonPreviewPanel: React.FC<JsonPreviewPanelProps> = ({
  datagraph,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(datagraph, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Generated JSON</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <pre className="bg-muted p-4 rounded-md overflow-auto max-h-[400px] text-xs font-mono">
          <code>{jsonString}</code>
        </pre>
        <p className="text-xs text-muted-foreground mt-2">
          This JSON will be saved to the view's data_graph field.
        </p>
      </CardContent>
    </Card>
  );
};

export default JsonPreviewPanel;
