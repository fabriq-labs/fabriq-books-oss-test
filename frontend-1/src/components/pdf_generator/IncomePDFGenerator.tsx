"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

interface IncomeStatementRow {
    account_id?: string;
    account_name: string;
    level: number;
    total_amount: number;
}

export interface IncomeStatementPdfProps {
    groups: { classification: string; items: IncomeStatementRow[] }[];
    fromDate: string;
    toDate: string;
    currencyCode: string;
    accountName?: string;
    view: string;
    ebitda: number;
    depreciationAndAmortizationTotal: number;
    interestAndTaxTotal: number;
    ebitdaAdjustmentsTotal: number;
    addBacksTotal: number;
    adjustedEbitda: number;
}

const formatCurrencyAmount = (n: number, currencyCode: string) => {
    const code = String(currencyCode || "INR").trim().toUpperCase() || "INR";
    const locale = code === "INR" ? "en-IN" : "en-US";
    const num = Number(n ?? 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const symbolMap: Record<string, string> = {
        USD: "USD",
        INR: "INR",
        PHP: "PHP",
    };
    const symbol = symbolMap[code] ?? code;
    return `${symbol} ${num}`;
};

const styles = StyleSheet.create({
    page: { backgroundColor: "#FFFFFF", padding: 24, fontFamily: "Helvetica", fontSize: 9 },
    title: { fontSize: 18, fontWeight: "bold", color: "#0f172a", marginBottom: 4 },
    subtitle: { fontSize: 10, color: "#64748b", marginBottom: 2 },
    filters: { fontSize: 9, color: "#475569", marginBottom: 14 },
    sectionTitle: { fontSize: 12, fontWeight: "bold", color: "#334155", marginTop: 12, marginBottom: 8 },
    table: { borderWidth: 1, borderColor: "#e2e8f0", marginBottom: 6 },
    tableRow: {
        flexDirection: "row",
        minHeight: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
    },
    thead: {
        backgroundColor: "#f8fafc",
        flexDirection: "row",
        minHeight: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
    },
    totalRow: {
        flexDirection: "row",
        minHeight: 20,
        backgroundColor: "#f1f5f9",
        borderTopWidth: 2,
        borderTopColor: "#cbd5e1",
    },
    colAccount: { width: 390, paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: "#e2e8f0" },
    colNum: { width: 140, paddingVertical: 4, paddingHorizontal: 6, textAlign: "right" },
    cellBold: { fontWeight: "bold" },
    cellMuted: { color: "#64748b" },
});

const IncomeStatementSectionTotals = ({
    classification,
    items,
    currencyCode,
}: {
    classification: string;
    items: IncomeStatementRow[];
    currencyCode: string;
}) => {
    const total = items.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
    return (
        <View style={[styles.tableRow, styles.totalRow]}>
            <View style={[styles.colAccount, styles.cellBold]}>
                <Text>{classification} Total</Text>
            </View>
            <View style={[styles.colNum, styles.cellBold]}>
                <Text>{formatCurrencyAmount(total, currencyCode)}</Text>
            </View>
        </View>
    );
};

export const IncomeStatementPDFDocument = ({
    groups,
    fromDate,
    toDate,
    currencyCode,
    accountName,
    view,
    ebitda,
    depreciationAndAmortizationTotal,
    interestAndTaxTotal,
    ebitdaAdjustmentsTotal,
    addBacksTotal,
    adjustedEbitda,
}: IncomeStatementPdfProps) => {
    const filterLines: string[] = [];
    if (accountName) filterLines.push(`Account: ${accountName}`);
    if (view) filterLines.push(`View: ${view}`);
    filterLines.push(`Currency: ${String(currencyCode || "INR").toUpperCase() || "INR"}`);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Text style={styles.title}>Income Statement</Text>
                <Text style={styles.subtitle}>
                    Period: {fromDate} to {toDate}
                </Text>
                {filterLines.length > 0 && <Text style={styles.filters}>{filterLines.join("  •  ")}</Text>}

                {groups.map((group) => (
                    <View key={group.classification}>
                        <Text style={styles.sectionTitle}>{group.classification}</Text>
                        <View style={styles.table}>
                            <View style={styles.thead}>
                                <View style={styles.colAccount}>
                                    <Text style={styles.cellBold}>Account</Text>
                                </View>
                                <View style={styles.colNum}>
                                    <Text style={styles.cellBold}>Total Amount</Text>
                                </View>
                            </View>
                            {group.items.map((row) => {
                                const indent = row.level > 0 ? { paddingLeft: 6 + row.level * 8 } : {};
                                return (
                                    <View key={row.account_id} style={styles.tableRow}>
                                        <View style={[styles.colAccount, indent]}>
                                            <Text style={row.level === 0 ? styles.cellBold : styles.cellMuted}>{row.account_name}</Text>
                                        </View>
                                        <View style={styles.colNum}>
                                            <Text>{formatCurrencyAmount(Number(row.total_amount || 0), currencyCode)}</Text>
                                        </View>
                                    </View>
                                );
                            })}
                            <IncomeStatementSectionTotals
                                classification={group.classification}
                                items={group.items}
                                currencyCode={currencyCode}
                            />
                        </View>
                    </View>
                ))}

                <Text style={styles.sectionTitle}>Add-backs and Adjustments</Text>
                <View style={styles.table}>
                    <View style={styles.tableRow}>
                        <View style={styles.colAccount}>
                            <Text>Depreciation & Amortization</Text>
                        </View>
                        <View style={styles.colNum}>
                            <Text>{formatCurrencyAmount(depreciationAndAmortizationTotal, currencyCode)}</Text>
                        </View>
                    </View>
                    <View style={styles.tableRow}>
                        <View style={styles.colAccount}>
                            <Text>Interest & Tax</Text>
                        </View>
                        <View style={styles.colNum}>
                            <Text>{formatCurrencyAmount(interestAndTaxTotal, currencyCode)}</Text>
                        </View>
                    </View>
                    <View style={styles.tableRow}>
                        <View style={styles.colAccount}>
                            <Text>EBITDA Adjustments</Text>
                        </View>
                        <View style={styles.colNum}>
                            <Text>{formatCurrencyAmount(ebitdaAdjustmentsTotal, currencyCode)}</Text>
                        </View>
                    </View>
                    <View style={[styles.tableRow, styles.totalRow]}>
                        <View style={[styles.colAccount, styles.cellBold]}>
                            <Text>Total Add-backs and Adjustments</Text>
                        </View>
                        <View style={[styles.colNum, styles.cellBold]}>
                            <Text>{formatCurrencyAmount(addBacksTotal, currencyCode)}</Text>
                        </View>
                    </View>
                    <View style={styles.tableRow}>
                        <View style={styles.colAccount}>
                            <Text>EBITDA</Text>
                        </View>
                        <View style={styles.colNum}>
                            <Text>{formatCurrencyAmount(ebitda, currencyCode)}</Text>
                        </View>
                    </View>
                    <View style={[styles.tableRow, styles.totalRow]}>
                        <View style={[styles.colAccount, styles.cellBold]}>
                            <Text>Adjusted EBITDA</Text>
                        </View>
                        <View style={[styles.colNum, styles.cellBold]}>
                            <Text>{formatCurrencyAmount(adjustedEbitda, currencyCode)}</Text>
                        </View>
                    </View>
                </View>
            </Page>
        </Document>
    );
};
