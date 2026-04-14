'use client';

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { TrialBalanceRow } from '@/pages/reports/BalanceSheet';
import { aggregateTrialBalanceSectionRows } from '@/lib/aggregateTrialBalanceSectionRows';



const formatCurrencyAmount = (n: number, currencyCode: string) => {
  const code = String(currencyCode || 'INR').trim().toUpperCase() || 'INR';
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  const num = Number(n ?? 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbolMap: Record<string, string> = {
    USD: 'USD',
    INR: 'INR',
    PHP: 'PHP',
  };
  const symbol = symbolMap[code] ?? code;
  return `${symbol} ${num}`;
};

const MIN_ROW_HEIGHT = 20;

const styles = StyleSheet.create({
  page: { backgroundColor: '#FFFFFF', padding: 24, fontFamily: 'Helvetica', fontSize: 9 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#64748b', marginBottom: 2 },
  filters: { fontSize: 9, color: '#475569', marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#1e293b', marginTop: 12, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 2, marginBottom: 6 },
  tableRow: {
    flexDirection: 'row',
    minHeight: MIN_ROW_HEIGHT,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  rowEven: { backgroundColor: '#ffffff' },
  rowOdd: { backgroundColor: '#f8fafc' },
  thead: {
    backgroundColor: '#e2e8f0',
    flexDirection: 'row',
    minHeight: MIN_ROW_HEIGHT,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  totalRow: {
    flexDirection: 'row',
    minHeight: MIN_ROW_HEIGHT,
    flexShrink: 0,
    backgroundColor: '#e2e8f0',
    borderTopWidth: 2,
    borderTopColor: '#94a3b8',
  },
  colAccount: { width: 220, paddingVertical: 4, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  colNum: { width: 188, paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: '#e2e8f0', textAlign: 'right' },
  colNumLast: { width: 188, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right' },
  cellBold: { fontWeight: 'bold' },
  cellMuted: { color: '#64748b' },
});

export interface TrialBalancePdfProps {
  groups: { classification: string; items: TrialBalanceRow[] }[];
  fromDate: string;
  toDate: string;
  currencyCode: string;
  accountName?: string | null;
  showOnlyNonZero: boolean;
  view: string;
}

function SectionTotals({ items, currencyCode }: { items: TrialBalanceRow[]; currencyCode: string }) {
  const totals = aggregateTrialBalanceSectionRows(items);
  return (
    <View style={[styles.tableRow, styles.totalRow]}>
      <View style={[styles.colAccount, styles.cellBold]}>
        <Text fixed>Total</Text>
      </View>
      <View style={[styles.colNum, styles.cellBold]}>
        <Text fixed>{formatCurrencyAmount(totals.total_debits, currencyCode)}</Text>
      </View>
      <View style={[styles.colNum, styles.cellBold]}>
        <Text fixed>{formatCurrencyAmount(totals.total_credits, currencyCode)}</Text>
      </View>
      <View style={[styles.colNumLast, styles.cellBold]}>
        <Text fixed>{formatCurrencyAmount(totals.total_balance, currencyCode)}</Text>
      </View>
    </View>
  );
}

export const TrialBalancePDFDocument = ({
  groups,
  fromDate,
  toDate,
  currencyCode,
  accountName,
  showOnlyNonZero,
  view,
}: TrialBalancePdfProps) => {
  const filterLines: string[] = [];
  if (accountName) filterLines.push(`Account: ${accountName}`);
  if (showOnlyNonZero) filterLines.push('Showing only rows with activity');
  if (view) filterLines.push(`View: ${view}`);
  filterLines.push(`Currency: ${String(currencyCode || 'INR').toUpperCase() || 'INR'}`);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Trial Balance</Text>
        <Text style={styles.subtitle}>
          Period: {fromDate} to {toDate}
        </Text>
        {filterLines.length > 0 && (
          <Text style={styles.filters}>{filterLines.join('  •  ')}</Text>
        )}

        {groups.map((group) => (
          <View key={group.classification}>
            <Text style={styles.sectionTitle}>{group.classification}</Text>
            <View style={styles.table}>
              <View style={styles.thead}>
                <View style={styles.colAccount}>
                  <Text style={styles.cellBold} fixed>Account</Text>
                </View>
                <View style={styles.colNum}>
                  <Text style={styles.cellBold} fixed>Debits</Text>
                </View>
                <View style={styles.colNum}>
                  <Text style={styles.cellBold} fixed>Credits</Text>
                </View>
                <View style={styles.colNumLast}>
                  <Text style={styles.cellBold} fixed>Total</Text>
                </View>
              </View>
              {group.items.map((row, index) => {
                const debits = Number(row.total_debits ?? 0);
                const credits = Number(row.total_credits ?? 0);
                const total = Number(row.total_balance ?? 0);
                const indent = row.level > 0 ? { paddingLeft: 6 + row.level * 8 } : {};
                return (
                  <View key={row.account_id} style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
                    <View style={[styles.colAccount, indent]}>
                      <Text style={row.level === 0 ? styles.cellBold : styles.cellMuted} fixed>
                        {row.account_name}
                      </Text>
                    </View>
                    {/* <View style={styles.colNum}>
                      <Text fixed>{formatNum(opening)}</Text>
                    </View> */}
                    <View style={styles.colNum}>
                      <Text fixed>{formatCurrencyAmount(debits, currencyCode)}</Text>
                    </View>
                    <View style={styles.colNum}>
                      <Text fixed>{formatCurrencyAmount(credits, currencyCode)}</Text>
                    </View>
                    {/* <View style={styles.colNum}>
                      <Text fixed>{formatNum(balance)}</Text>
                    </View> */}
                    <View style={styles.colNumLast}>
                      <Text fixed>{formatCurrencyAmount(total, currencyCode)}</Text>
                    </View>
                  </View>
                );
              })}
              <SectionTotals items={group.items} currencyCode={currencyCode} />
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
};