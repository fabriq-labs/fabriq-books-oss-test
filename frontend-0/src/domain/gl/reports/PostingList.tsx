import { ReportFrame, money, rateCell, type ReportEnvelope } from './ReportFrame';

export default function PostingList() {
  return (
    <ReportFrame title="Posting list" path="posting-list">
      {(report: ReportEnvelope | null) => (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Entity</th>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3">Debit</th>
                <th className="py-2 pr-3">Credit</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3 text-right">Report amount</th>
                <th className="py-2">Rate</th>
              </tr>
            </thead>
            <tbody>
              {(report?.rows ?? []).map((row) => (
                <tr key={String(row.id)} className="border-b">
                  <td className="py-2 pr-3">{String(row.value_date || '')}</td>
                  <td className="py-2 pr-3">{String(row.entity_name || '')}</td>
                  <td className="py-2 pr-3">{String(row.description || row.name || '')}</td>
                  <td className="py-2 pr-3">{String(row.debit_account_name || '')}</td>
                  <td className="py-2 pr-3">{String(row.credit_account_name || '')}</td>
                  <td className="py-2 pr-3">{String(row.kind || '')}</td>
                  <td className="py-2 pr-3 text-right">{money(row.amount)}</td>
                  <td className="py-2 pr-3 text-right">{money(row.converted_amount)}</td>
                  <td className="py-2">{rateCell(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report && report.rows.length === 0 && <p className="py-6 text-sm text-muted-foreground">No postings in this period.</p>}
        </div>
      )}
    </ReportFrame>
  );
}
