import * as XLSX from 'xlsx';

type MoneyLine = {
  label: string;
  account_code?: string;
  entity: string;
  currency: string;
  amount_orig: number;
  amount_cad: number;
  notes?: string;
};

type GapItem = {
  id: string;
  status: string;
  severity: string;
  title: string;
  detail: string;
};

function sheetFromLines(lines: MoneyLine[] | undefined, extraHeader?: string[]): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    extraHeader || ['Label', 'Entity', 'Currency', 'Amount (orig)', 'Amount CAD', 'Account', 'Notes'],
  ];
  for (const l of lines || []) {
    rows.push([
      l.label,
      l.entity,
      l.currency,
      l.amount_orig,
      l.amount_cad,
      l.account_code || '',
      l.notes || '',
    ]);
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

export function downloadTaxPackageExcel(ctx: Record<string, any>, coverMarkdown: string) {
  const wp = ctx.workpapers || {};
  const ca = wp.canada || {};
  const fr = wp.foreign || {};
  const gaps = (ctx.gaps || []) as GapItem[];
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Canadian T1 organizer', `TY ${ctx.tax_year || ''}`],
      ['Recipient', ctx.recipient || ''],
      ['Period', `${ctx.from_date || ''} → ${ctx.to_date || ''}`],
      ['FX', wp.fx_method || ''],
      ['Unmatched lines', ctx.unmatched_count ?? 0],
      [],
      ['Cover letter'],
      [coverMarkdown],
    ]),
    'Summary'
  );
  XLSX.utils.book_append_sheet(wb, sheetFromLines([...(ca.t4_net_salary || []), ...(ca.t4_bonus || [])]), 'T4');
  XLSX.utils.book_append_sheet(wb, sheetFromLines([...(ca.t776_rent || []), ...(ca.t776_expenses || [])]), 'T776');
  XLSX.utils.book_append_sheet(wb, sheetFromLines([...(ca.t2125_studio || []), ...(ca.hst_remitted || [])]), 'T2125');
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromLines([
      ...(fr.rent_gross || []),
      ...(fr.rent_expenses || []),
      ...(fr.nro_interest || []),
      ...(fr.nre_interest || []),
      ...(fr.dividends || []),
      ...(fr.capital_gains || []),
    ]),
    'Foreign'
  );
  XLSX.utils.book_append_sheet(wb, sheetFromLines(fr.tax_paid_cy || []), 'FTC');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['T1135 specified foreign property'],
      [wp.t1135_note || ''],
    ]),
    'T1135'
  );
  XLSX.utils.book_append_sheet(wb, sheetFromLines(wp.exclusions || []), 'Exclusions');
  const gapRows: (string | number)[][] = [['Id', 'Title', 'Severity', 'Status', 'Detail']];
  for (const g of gaps) {
    gapRows.push([g.id, g.title, g.severity, g.status, g.detail]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gapRows), 'Gaps');

  XLSX.writeFile(wb, `t1-organizer-${ctx.tax_year || 'package'}.xlsx`);
}

export function downloadTaxPackageMarkdown(coverMarkdown: string, taxYear?: number) {
  const blob = new Blob([coverMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `t1-cover-letter-${taxYear || 'package'}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
