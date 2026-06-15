import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
    applyFinanceHighlights,
    type FinanceHighlightOptions,
} from './financeMessageHighlights';

interface AssistantMessageRendererProps {
    content: string;
    className?: string;
    knownAccountNames?: string[];
}

type Block =
    | { type: 'paragraph'; lines: string[] }
    | { type: 'ordered-list'; items: string[] };

/** Split assistant text into paragraphs and numbered lists. */
function parseBlocks(text: string): Block[] {
    const blocks: Block[] = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            i += 1;
            continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
            const items: string[] = [];
            while (i < lines.length) {
                const listLine = lines[i].trim();
                if (!listLine) break;
                if (!/^\d+\.\s+/.test(listLine)) break;
                items.push(listLine.replace(/^\d+\.\s+/, ''));
                i += 1;
            }
            blocks.push({ type: 'ordered-list', items });
            continue;
        }

        const paragraphLines: string[] = [];
        while (i < lines.length) {
            const paraLine = lines[i];
            const paraTrimmed = paraLine.trim();
            if (!paraTrimmed) break;
            if (/^\d+\.\s+/.test(paraTrimmed)) break;
            paragraphLines.push(paraTrimmed);
            i += 1;
        }
        blocks.push({ type: 'paragraph', lines: paragraphLines });
    }

    return blocks;
}

/** Render **bold** segments within a line of text. */
function renderInlineMarkdown(text: string): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={index} className="font-semibold text-foreground">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
    });
}

/**
 * Renders assistant messages with markdown bold and numbered lists.
 * Used for analytics summaries, rankings, and finance Q&A without tool tables.
 */
export const AssistantMessageRenderer: React.FC<AssistantMessageRendererProps> = ({
    content,
    className,
    knownAccountNames = [],
}) => {
    if (!content?.trim()) return null;

    const highlightOptions = useMemo<FinanceHighlightOptions>(
        () => ({ knownAccountNames }),
        [knownAccountNames]
    );

    const blocks = parseBlocks(content);

    return (
        <div className={cn('space-y-3 text-[15px] leading-relaxed text-foreground', className)}>
            {blocks.map((block, blockIndex) => {
                if (block.type === 'ordered-list') {
                    return (
                        <ol
                            key={blockIndex}
                            className="space-y-2.5 list-none pl-0 m-0"
                        >
                            {block.items.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex gap-2">
                                    <span className="shrink-0 font-medium text-muted-foreground w-5 text-right">
                                        {itemIndex + 1}.
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        {renderInlineMarkdown(
                                            applyFinanceHighlights(item, {
                                                ...highlightOptions,
                                                listItem: true,
                                            })
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    );
                }

                return (
                    <p key={blockIndex} className="m-0 whitespace-pre-wrap">
                        {block.lines.map((line, lineIndex) => (
                            <React.Fragment key={lineIndex}>
                                {lineIndex > 0 && <br />}
                                {renderInlineMarkdown(applyFinanceHighlights(line, highlightOptions))}
                            </React.Fragment>
                        ))}
                    </p>
                );
            })}
        </div>
    );
};
