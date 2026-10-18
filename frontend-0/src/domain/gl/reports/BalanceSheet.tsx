import { ReportFrame, money, rateCell, type ReportEnvelope } from './ReportFrame';

export default function BalanceSheet() {
  return (
    <ReportFrame title="Balance Sheet" path="balance-sheet">
      {(report: ReportEnvelope | null) => (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Classification</th>
                <th className="py-2 pr-3">Account currency</th>
                <th className="py-2 pr-3 text-right">Opening</th>
                <th className="py-2 pr-3 text-right">Closing</th>
                <th className="py-2">Rate</th>
              </tr>
            </thead>
            <tbody>
              {(report?.rows ?? []).map((row) => (
                <tr key={String(row.account_id)} className="border-b">
                  <td className="py-2 pr-3">{row.code ? `${row.code} ` : ''}{String(row.name || '')}</td>
                  <td className="py-2 pr-3">{String(row.classification || '')}</td>
                  <td className="py-2 pr-3">{String(row.account_currency || '')}</td>
                  <td className="py-2 pr-3 text-right">{money(row.opening_balance)}</td>
                  <td className="py-2 pr-3 text-right">{money(row.closing_balance)}</td>
                  <td className="py-2">{rateCell(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report && report.rows.length === 0 && <p className="py-6 text-sm text-muted-foreground">No balance-sheet activity in this period.</p>}
        </div>
      )}
    </ReportFrame>
  );
}
