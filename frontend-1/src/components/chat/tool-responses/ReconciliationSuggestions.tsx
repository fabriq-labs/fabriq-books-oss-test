import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCurrencyFormatting } from '@/utils/currencyUtils';
import { Link2, Receipt, FileText } from 'lucide-react';

interface MatchSuggestion {
  type: 'payment_receipt' | 'invoice';
  id: string;
  reference: string;
  amount: number;
  date: string;
  customer: string | null;
  confidence: 'high' | 'medium' | 'low';
}

interface PostingWithSuggestions {
  posting_id: string;
  posting_description: string | null;
  posting_amount: number;
  posting_date: string | null;
  suggestions: MatchSuggestion[];
}

interface ReconciliationSuggestionsProps {
  data: PostingWithSuggestions[];
  onSendMessage?: (text: string) => void;
  sidebarMode?: boolean;
}

const confidenceVariant = (c: string) => {
  if (c === 'high') return 'default';
  if (c === 'medium') return 'secondary';
  return 'outline';
};

export const ReconciliationSuggestions: React.FC<ReconciliationSuggestionsProps> = ({
  data,
  onSendMessage,
  sidebarMode,
}) => {
  const { formatCurrency } = useCurrencyFormatting();

  if (!data || data.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-600">No unmatched transactions with suggestions.</p>
      </div>
    );
  }

  const handleConfirmMatch = (postingId: string, matchType: string, matchId: string) => {
    const typeLabel = matchType === 'payment_receipt' ? 'payment' : 'invoice';
    const message = `Match ${postingId} to ${typeLabel} ${matchId}`;
    onSendMessage?.(message);
  };

  return (
    <div className="space-y-4">
      {data.map((row) => (
        <Card key={row.posting_id} className="border border-gray-200 bg-white">
          <CardHeader className={sidebarMode ? 'pb-2 px-3 pt-3' : 'pb-3'}>
            <CardTitle className={`flex items-center gap-2 ${sidebarMode ? 'text-sm' : 'text-base'}`}>
              <Link2 className="text-blue-600" size={sidebarMode ? 14 : 16} />
              {row.posting_description || row.posting_id}
            </CardTitle>
            <div className={`flex flex-wrap items-center gap-2 ${sidebarMode ? 'text-xs' : 'text-sm'} text-gray-600`}>
              <span className="font-medium">{formatCurrency(row.posting_amount)}</span>
              {row.posting_date && <span>{row.posting_date}</span>}
            </div>
          </CardHeader>
          <CardContent className={sidebarMode ? 'space-y-2 px-3 pb-3' : 'space-y-3'}>
            {row.suggestions.length === 0 ? (
              <p className="text-sm text-gray-500">No suggested matches.</p>
            ) : (
              <ul className="space-y-2">
                {row.suggestions.map((s) => (
                  <li
                    key={`${s.type}-${s.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {s.type === 'payment_receipt' ? (
                        <Receipt size={sidebarMode ? 12 : 14} className="text-green-600 shrink-0" />
                      ) : (
                        <FileText size={sidebarMode ? 12 : 14} className="text-blue-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900 truncate block">{s.reference}</span>
                        {s.customer && (
                          <span className="text-gray-500 text-xs truncate block">{s.customer}</span>
                        )}
                        <span className="text-gray-600 text-xs">
                          {formatCurrency(s.amount)} · {s.date}
                        </span>
                      </div>
                      <Badge variant={confidenceVariant(s.confidence)} className="shrink-0 text-xs">
                        {s.confidence}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      className="shrink-0"
                      onClick={() => handleConfirmMatch(row.posting_id, s.type, s.id)}
                      disabled={!onSendMessage}
                      title={onSendMessage ? 'Send match request to agent' : 'Confirm via chat'}
                    >
                      Confirm Match
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
