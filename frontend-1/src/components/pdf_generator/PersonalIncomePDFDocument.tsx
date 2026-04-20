"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface PersonalIncomeRow {
  account_id?: string;
  account_name: string;
  level: number;
  total_amount: number;
}

export interface PersonalIncomePDFProps {
  rows: PersonalIncomeRow[];
  fromDate: string;
  toDate: string;
  currencyCode: string;
  entityName: string;
  fyLabel: string;
  incomeTotal: number;
}

const fmt = (n: number, code: string) => {
  const locale = code === "INR" ? "en-IN" : "en-US";
  return `${code} ${Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const styles = StyleSheet.create({
  page: { backgroundColor: "#fff", padding: 28, fontFamily: "Helvetica", fontSize: 9 },
  title: { fontSize: 16, fontWeight: "bold", color: "#0f172a", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#64748b", marginBottom: 12 },
  thead: { flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", minHeight: 20 },
  theadCell: { padding: "4 6", fontWeight: "bold", color: "#334155" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", minHeight: 18 },
  cell: { padding: "3 6", color: "#374151" },
  totalRow: { flexDirection: "row", backgroundColor: "#f8fafc", borderTopWidth: 1.5, borderTopColor: "#94a3b8", minHeight: 22 },
  totalCell: { padding: "4 6", fontWeight: "bold", color: "#0f172a" },
  right: { textAlign: "right" },
});

export function PersonalIncomePDFDocument({ rows, fromDate, toDate, currencyCode, entityName, fyLabel, incomeTotal }: PersonalIncomePDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Personal Income Report</Text>
        <Text style={styles.subtitle}>
          {entityName} · {fyLabel} · {fromDate} to {toDate}
        </Text>

        {/* Table header */}
        <View style={styles.thead}>
          <Text style={[styles.theadCell, { flex: 3 }]}>Account</Text>
          <Text style={[styles.theadCell, { flex: 1, textAlign: "right" }]}>Amount</Text>
        </View>

        {/* Rows */}
        {rows.map((row, i) => (
          <View key={row.account_id ?? i} style={styles.row}>
            <Text style={[styles.cell, { flex: 3, paddingLeft: 6 + row.level * 10 }]}>
              {row.account_name}
            </Text>
            <Text style={[styles.cell, { flex: 1, textAlign: "right" }]}>
              {fmt(Math.abs(row.total_amount), currencyCode)}
            </Text>
          </View>
        ))}

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={[styles.totalCell, { flex: 3 }]}>Total Income</Text>
          <Text style={[styles.totalCell, { flex: 1, textAlign: "right" }]}>
            {fmt(incomeTotal, currencyCode)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
