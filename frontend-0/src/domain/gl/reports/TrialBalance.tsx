import { ReportFrame, money, rateCell, type ReportEnvelope } from './ReportFrame';

export default function TrialBalance() {
  return (
    <ReportFrame title="Trial balance" path="trial-balance">
      {(report: ReportEnvelope | null) => (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Classification</th>
                <th className="py-2 pr-3 text-right">Opening debit</th>
                <th className="py-2 pr-3 text-right">Opening credit</th>
                <th className="py-2 pr-3 text-right">Period debit</th>
                <th className="py-2 pr-3 text-right">Period credit</th>
                <th className="py-2">Rate</th>
              </tr>
            </thead>
            <tbody>
              {(report?.rows ?? []).map((row) => (
                <tr key={String(row.account_id)} className="border-b">
                  <td className="py-2 pr-3">{row.code ? `${row.code} ` : ''}{String(row.name || '')}</td>
                  <td className="py-2 pr-3">{String(row.classification || '')}</td>
                  <td className="py-2 pr-3 text-right">{money(row.opening_debit)}</td>
                  <td className="py-2 pr-3 text-right">{money(row.opening_credit)}</td>
                  <td className="py-2 pr-3 text-right">{money(row.period_debit)}</td>
                  <td className="py-2 pr-3 text-right">{money(row.period_credit)}</td>
                  <td className="py-2">{rateCell(row)}</td>
                </tr>
              ))}
            </tbody>
            {report?.totals && (
              <tfoot>
                <tr className="font-medium">
                  <td className="py-2 pr-3" colSpan={2}>Total</td>
                  <td className="py-2 pr-3 text-right">{money(report.totals.opening_debit)}</td>
                  <td className="py-2 pr-3 text-right">{money(report.totals.opening_credit)}</td>
                  <td className="py-2 pr-3 text-right">{money(report.totals.period_debit)}</td>
                  <td className="py-2 pr-3 text-right">{money(report.totals.period_credit)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          {report && report.rows.length === 0 && <p className="py-6 text-sm text-muted-foreground">No activity in this period.</p>}
        </div>
      )}
    </ReportFrame>
  );
}
