import { TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import moment from 'moment';
import type { CustomRowRenderer } from '@/types/customRowRenderer';

export function createBankTransactionRowRenderer(
  selectedAccountId: string | undefined,
  displayCurrency: string
): CustomRowRenderer {
  return {
    columns: [
      { key: 'date', title: 'Date', width: '110px', sortKey: 'value_date' },
      { key: 'description', title: 'Description', sortKey: 'description' },
      { key: 'category', title: 'Category' },
      { key: 'amount', title: 'Amount', align: 'right', width: '160px', sortKey: 'amount' },
      { key: 'actions', title: '', width: '60px' },
    ],

    renderCells: (record, { isSelected, onSelect, actions }) => {
      const isMoneyIn = selectedAccountId
        ? record.account_id === selectedAccountId
        : false;

      const categoryName = selectedAccountId
        ? record.account_id === selectedAccountId
          ? (record.credit_account?.name || record.category?.name)
          : (record.account?.name || record.category?.name)
        : (record.credit_account?.name || record.category?.name || record.account?.name);

      const date = record.value_date || record.posting_date;
      const amount = record.amount != null ? Number(record.amount) : null;

      return (
        <>
          <TableCell className="w-10 pr-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(!!checked)}
              className="border-gray-300"
            />
          </TableCell>

          {/* Date */}
          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
            {date ? moment(date).format('DD MMM YYYY') : '—'}
          </TableCell>

          {/* Description */}
          <TableCell>
            <div className="text-sm font-medium leading-tight">
              {record.description || record.notes || '—'}
            </div>
            {record.description && record.notes && (
              <div className="text-xs text-muted-foreground mt-0.5">{record.notes}</div>
            )}
          </TableCell>

          {/* Category (counter account) as a subtle badge */}
          <TableCell>
            {categoryName ? (
              <Badge variant="secondary" className="text-xs font-normal max-w-[180px] truncate">
                {categoryName}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>

          {/* Amount: colored, signed, with currency prefix */}
          <TableCell className="text-right">
            <span className={cn('font-mono text-sm font-medium', {
              'text-green-700': isMoneyIn,
              'text-red-600': !isMoneyIn,
            })}>
              <span className="text-xs mr-0.5 font-normal opacity-70">{displayCurrency}</span>
              {isMoneyIn ? '+' : '−'}
              {amount != null
                ? amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                : '—'}
            </span>
          </TableCell>

          {/* Actions */}
          <TableCell className="text-right">{actions}</TableCell>
        </>
      );
    },

    rowClassName: (record) => {
      const isMoneyIn = selectedAccountId
        ? record.account_id === selectedAccountId
        : false;

      return isMoneyIn
        ? 'border-l-4 border-l-green-500'
        : 'border-l-4 border-l-red-400';
    },
  };
}
