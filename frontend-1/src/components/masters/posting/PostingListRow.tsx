import { TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import moment from 'moment';
import type { CustomRowRenderer } from '@/types/customRowRenderer';
import type { CellHighlightMap } from '@/components/masters/DynamicTable';
import { ReconciliationStatusBadge } from './ReconciliationStatusBadge';

export function createPostingRowRenderer(predictedFields: CellHighlightMap): CustomRowRenderer {
  return {
    columns: [
      { key: 'transaction', title: 'Transaction', sortKey: 'description' },
      { key: 'debit_account', title: 'Debit Account', sortKey: 'account_id' },
      { key: 'credit_account', title: 'Credit Account', sortKey: 'credit_account_id' },
      { key: 'amount', title: 'Amount', align: 'right', width: '160px', sortKey: 'amount' },
      { key: 'date', title: 'Date', width: '110px', sortKey: 'value_date' },
      { key: 'actions', title: '', width: '80px' },
    ],

    renderCells: (record, { isSelected, onSelect, actions }) => {
      const date = record.value_date || record.posting_date;

      return (
        <>
          <TableCell className="w-10 pr-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(!!checked)}
              className="border-gray-300"
            />
          </TableCell>

          {/* Transaction: description + notes + legal entity badge */}
          <TableCell>
            <div className={cn('font-medium text-sm leading-tight', {
              'text-muted-foreground': !record.description,
            })}>
              {record.description || record.notes || '—'}
            </div>
            {record.description && record.notes && (
              <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                {record.notes}
              </div>
            )}
            {(record.legal_entity?.legal_name || record.legal_entity?.name) && (
              <div className="mt-1">
                <Badge variant="outline" className="text-xs py-0 h-5 font-normal text-muted-foreground border-muted-foreground/30 bg-muted/40">
                  {record.legal_entity.legal_name || record.legal_entity.name}
                </Badge>
              </div>
            )}
          </TableCell>

          {/* Debit account — highlight if AI predicted */}
          <TableCell className="text-sm">
            <span className={cn({
              'bg-primary/10 rounded px-1': predictedFields[record.id] === 'account_id',
            })}>
              {record.account?.name || '—'}
            </span>
            {record.account?.code && (
              <div className="mt-0.5">
                <Badge variant="outline" className="text-xs py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30 bg-muted/40">
                  {record.account.code}
                </Badge>
              </div>
            )}
          </TableCell>

          {/* Credit account — highlight if AI predicted */}
          <TableCell className="text-sm">
            <span className={cn({
              'bg-primary/10 rounded px-1': predictedFields[record.id] === 'credit_account_id',
            })}>
              {record.credit_account?.name || record.category?.name || '—'}
            </span>
            {record.credit_account?.code && (
              <div className="mt-0.5">
                <Badge variant="outline" className="text-xs py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30 bg-muted/40">
                  {record.credit_account.code}
                </Badge>
              </div>
            )}
          </TableCell>

          {/* Amount with currency prefix — debit account currency, fall back to credit account */}
          <TableCell className="text-right">
            {(record.account?.currency?.code || record.credit_account?.currency?.code) && (
              <span className="text-xs text-muted-foreground mr-1 font-normal">
                {record.account?.currency?.code ?? record.credit_account?.currency?.code}
              </span>
            )}
            <span className="font-mono text-sm">
              {record.amount != null
                ? Number(record.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })
                : '—'}
            </span>
          </TableCell>

          {/* Date */}
          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
            {date ? moment(date).format('DD MMM YYYY') : '—'}
          </TableCell>

          {/* Actions */}
          <TableCell className="text-right">{actions}</TableCell>
        </>
      );
    },

    rowClassName: (record) => {
      if (record.reconciliation_status === 'CONFIRMED')
        return 'border-l-4 border-l-green-500 bg-green-50 hover:bg-green-100/60';
      if (record.reconciliation_status === 'MATCHED')
        return 'border-l-4 border-l-amber-400 bg-amber-50 hover:bg-amber-100/60';
      return 'border-l-4 border-l-transparent';
    },
  };
}
