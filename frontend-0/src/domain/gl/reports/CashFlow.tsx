import { ReportFrame, money, type ReportEnvelope } from './ReportFrame';

export default function CashFlow() {
  return (
    <ReportFrame title="Cash flow" path="cash-flow">
      {(report: ReportEnvelope | null) => {
        const summary = report?.summary ?? {};
        return (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Opening cash</p>
                <p className="text-lg font-medium">{money(summary.opening_cash)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Net change</p>
                <p className="text-lg font-medium">{money(summary.net_change)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Closing cash</p>
                <p className="text-lg font-medium">{money(summary.closing_cash)}</p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Activity</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3 text-right">Net cash</th>
                  <th className="py-2">Rate</th>
                </tr>
              </thead>
              <tbody>
                {(report?.rows ?? []).map((row) => (
                  <tr key={`${row.activity}-${row.account_id}`} className="border-b">
                    <td className="py-2 pr-3">{String(row.activity || '')}</td>
                    <td className="py-2 pr-3">{String(row.account_name || '')}</td>
                    <td className="py-2 pr-3 text-right">{money(row.net_cash)}</td>
                    <td className="py-2">{row.rate_missing ? 'rate_missing' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    </ReportFrame>
  );
}
