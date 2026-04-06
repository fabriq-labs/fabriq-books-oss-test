'use client';

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { TrialBalanceRow } from '@/pages/reports/BalanceSheet';

const formatNum = (n: number) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MIN_ROW_HEIGHT = 20;

const styles = StyleSheet.create({
  page: { backgroundColor: '#FFFFFF', padding: 24, fontFamily: 'Helvetica', fontSize: 9 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#64748b', marginBottom: 2 },
  filters: { fontSize: 9, color: '#475569', marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#334155', marginTop: 12, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 4 },
  tableRow: {
    flexDirection: 'row',
    minHeight: MIN_ROW_HEIGHT,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  thead: {
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    minHeight: MIN_ROW_HEIGHT,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  totalRow: {
    flexDirection: 'row',
    minHeight: MIN_ROW_HEIGHT,
    flexShrink: 0,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 2,
    borderTopColor: '#cbd5e1',
  },
  colAccount: { width: 290, paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  colNum: { width: 82, paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 1, borderRightColor: '#e2e8f0', textAlign: 'right' },
  colNumLast: { width: 82, paddingVertical: 4, paddingHorizontal: 4, textAlign: 'right' },
  cellBold: { fontWeight: 'bold' },
  cellMuted: { color: '#64748b' },
});

export interface TrialBalancePdfProps {
  groups: { classification: string; items: TrialBalanceRow[] }[];
  fromDate: string;
  toDate: string;
  accountName?: string | null;
  showOnlyNonZero: boolean;
  view: string;
}

function SectionTotals({ items }: { items: TrialBalanceRow[] }) {
  const totals = items.reduce(
    (acc, curr) => {
      if (curr.level === 0) {
        return {
          total_debits: acc.total_debits + Number(curr.total_debits),
          total_credits: acc.total_credits + Number(curr.total_credits),
          balance: acc.balance + Number(curr.balance),
          opening_balance: acc.opening_balance + Number(curr.opening_balance ?? 0),
          total_balance: acc.total_balance + Number(curr.total_balance ?? 0),
        };
      }
      return acc;
    },
    { total_debits: 0, total_credits: 0, balance: 0, opening_balance: 0, total_balance: 0 }
  );
  return (
    <View style={[styles.tableRow, styles.totalRow]}>
      <View style={[styles.colAccount, styles.cellBold]}>
        <Text fixed>Total</Text>
      </View>
      <View style={[styles.colNum, styles.cellBold]}>
        <Text fixed>{formatNum(totals.opening_balance)}</Text>
      </View>
      <View style={[styles.colNum, styles.cellBold]}>
        <Text fixed>{formatNum(totals.total_debits)}</Text>
      </View>
      <View style={[styles.colNum, styles.cellBold]}>
        <Text fixed>{formatNum(totals.total_credits)}</Text>
      </View>
      <View style={[styles.colNum, styles.cellBold]}>
        <Text fixed>{formatNum(totals.balance)}</Text>
      </View>
      <View style={[styles.colNumLast, styles.cellBold]}>
        <Text fixed>{formatNum(totals.total_balance)}</Text>
      </View>
    </View>
  );
}

export const TrialBalancePDFDocument = ({
  groups,
  fromDate,
  toDate,
  accountName,
  showOnlyNonZero,
  view,
}: TrialBalancePdfProps) => {
  const filterLines: string[] = [];
  if (accountName) filterLines.push(`Account: ${accountName}`);
  if (showOnlyNonZero) filterLines.push('Showing only rows with activity');
  if (view) filterLines.push(`View: ${view}`);

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
                  <Text style={styles.cellBold} fixed>Opening</Text>
                </View>
                <View style={styles.colNum}>
                  <Text style={styles.cellBold} fixed>Debits</Text>
                </View>
                <View style={styles.colNum}>
                  <Text style={styles.cellBold} fixed>Credits</Text>
                </View>
                <View style={styles.colNum}>
                  <Text style={styles.cellBold} fixed>Current</Text>
                </View>
                <View style={styles.colNumLast}>
                  <Text style={styles.cellBold} fixed>Total</Text>
                </View>
              </View>
              {group.items.map((row) => {
                const opening = Number(row.opening_balance ?? 0);
                const debits = Number(row.total_debits ?? 0);
                const credits = Number(row.total_credits ?? 0);
                const balance = Number(row.balance ?? 0);
                const total = Number(row.total_balance ?? 0);
                const indent = row.level > 0 ? { paddingLeft: 6 + row.level * 8 } : {};
                return (
                  <View key={row.account_id} style={styles.tableRow}>
                    <View style={[styles.colAccount, indent]}>
                      <Text style={row.level === 0 ? styles.cellBold : styles.cellMuted} fixed>
                        {row.account_name}
                      </Text>
                    </View>
                    <View style={styles.colNum}>
                      <Text fixed>{formatNum(opening)}</Text>
                    </View>
                    <View style={styles.colNum}>
                      <Text fixed>{formatNum(debits)}</Text>
                    </View>
                    <View style={styles.colNum}>
                      <Text fixed>{formatNum(credits)}</Text>
                    </View>
                    <View style={styles.colNum}>
                      <Text fixed>{formatNum(balance)}</Text>
                    </View>
                    <View style={styles.colNumLast}>
                      <Text fixed>{formatNum(total)}</Text>
                    </View>
                  </View>
                );
              })}
              <SectionTotals items={group.items} />
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
};
