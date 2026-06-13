import React from 'react';
import { PostingJournalDisplay, type PostingJournalRow } from './PostingJournalDisplay';

export type PostingDualTable = {
  side: 'debit' | 'credit';
  accountId?: string;
  accountName?: string;
  accountCode?: string | null;
  title?: string;
  rows: PostingJournalRow[];
};

interface PostingDualDisplayProps {
  tables: PostingDualTable[];
  currencyCode?: string;
  sidebarMode?: boolean;
}

export const PostingDualDisplay: React.FC<PostingDualDisplayProps> = ({
  tables,
  currencyCode,
  sidebarMode,
}) => {
  if (!tables?.length) {
    return null;
  }

  return (
    <div className="space-y-6">
      {tables.map((table) => (
        <PostingJournalDisplay
          key={`${table.side}-${table.accountId ?? table.title}`}
          rows={table.rows}
          title={table.title}
          highlightSide={table.side}
          highlightAccountName={table.accountName}
          currencyCode={currencyCode}
          sidebarMode={sidebarMode}
        />
      ))}
    </div>
  );
};
