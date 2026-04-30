"use client";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFViewer,
} from "@react-pdf/renderer";
import moment from "moment";
import { convertToWords } from "../utils/helper";
import { currencyUtils } from "@/utils/currencyUtils";

// Extract the fields we need for invoice PDF
export const extractInvoicePDFData = (data: any): any => {
  if (!data || typeof data !== "object") return {};

  return {
    invoice_number: data.invoice_number,
    invoice_date: data.invoice_date,
    items: Array.isArray(data.items)
      ? data.items.map((item: any) => ({
        product: item.product,
        period: item.period,
        quantity: item.quantity,
        price: item.price,
        tax: item.tax,
        total: item.total,
        item_name: item.item_name,
        item_description: item.item_description,
        discount_rate: item.discount_rate,
        discount_amount: item.discount_amount,
      }))
      : [],
    subTotal: data.subTotal,
    totalTax: data.totalTax,
    grandTotal: data.grandTotal,
    legalEntityData: data.legalEntityData,
    customerData: data.customerData,
    locationData: data.locationData,
    notes: data.notes,
    terms_and_conditions: data.terms_and_conditions,
    adjustable_value: data.adjustable_value,
    adjustable_label: data.adjustable_label,
  };
};

const styles = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", padding: 20, fontFamily: "Helvetica" },

  // Header section with company info and invoice details
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 8,
  },
  companyInfo: { width: "60%" },
  invoiceInfo: { width: "35%", alignItems: "flex-end" },

  // Company details
  companyName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 4,
  },
  companyAddress: {
    fontSize: 9,
    color: "#000000",
    marginBottom: 1,
    lineHeight: 1.2,
  },
  gstin: { fontSize: 9, color: "#000000", marginBottom: 1 },
  lutNumber: { fontSize: 9, color: "#000000", marginBottom: 4 },

  // Invoice title and details
  invoiceTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 4,
  },
  invoice_number: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 1,
  },
  invoice_date: { fontSize: 10, color: "#000000" },

  // Billing and shipping sections
  billingSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  billTo: { width: "48%" },
  shipTo: { width: "48%" },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 9,
    color: "#000000",
    marginBottom: 1,
    lineHeight: 1.2,
  },

  // Table styles
  table: { marginTop: 8, marginBottom: 10 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#000000",
  },
  tableRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#000000",
    borderTopWidth: 0,
  },
  tableRowEven: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#000000",
    borderTopWidth: 0,
    backgroundColor: "#f8f8f8",
  },
  tableCell: {
    padding: 4,
    fontSize: 8,
    borderRightWidth: 1,
    borderRightColor: "#000000",
  },
  tableCellLast: { padding: 4, fontSize: 8 },
  tableHeaderCell: { fontWeight: "bold", color: "#000000" },

  // Column widths matching the invoice (no period column)
  colNumber: { width: "6%", textAlign: "center" },
  colDescription: { width: "28%" },
  colQty: { width: "8%", textAlign: "center" },
  colRate: { width: "18%", textAlign: "right" },
  colIgstPercent: { width: "8%", textAlign: "center" },
  colIgstAmount: { width: "14%", textAlign: "right" },
  colAmount: { width: "18%", textAlign: "right" },

  // Totals section
  totalsSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    marginBottom: 10,
  },
  totalsBox: { width: "250px" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  totalLabel: { fontSize: 9, fontWeight: "bold", color: "#000000" },
  totalValue: { fontSize: 9, fontWeight: "bold", color: "#000000" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: "#e0e0e0",
    borderTopWidth: 1,
    borderTopColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
  },
  grandTotalLabel: { fontSize: 11, fontWeight: "bold", color: "#000000" },
  grandTotalValue: { fontSize: 11, fontWeight: "bold", color: "#000000" },

  // Amount in words
  amountInWords: {
    marginBottom: 10,
    padding: 6,
    backgroundColor: "#f8f8f8",
    borderLeftWidth: 2,
    borderLeftColor: "#000000",
  },
  amountInWordsLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 2,
  },
  amountInWordsText: { fontSize: 9, color: "#000000", fontWeight: "bold" },

  // Bank details
  bankDetails: { marginBottom: 10 },
  bankDetailsTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 4,
  },
  bankDetailsText: {
    fontSize: 8,
    color: "#000000",
    marginBottom: 1,
    lineHeight: 1.2,
  },

  // Terms and conditions
  termsConditions: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#000000",
  },
  termsText: { fontSize: 9, color: "#000000" },

  // Footer
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  signBox: { width: "45%" },
  signTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 4,
  },
  signLine: {
    height: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    marginBottom: 2,
  },
  signHint: { fontSize: 8, color: "#000000" },
  footerBrand: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8,
    color: "#666666",
  },
});

const InvoicePDF = ({
  invoiceData,
  currencyCode = "INR",
  currencySymbol = "₹",
  products,
  legalEntity,
  customer,
  locations,
}: any) => {
  // Use PDF-safe symbol so symbols like ₹ render correctly (INR instead of broken glyph)
  const pdfSymbol = currencyUtils.getPdfSafeSymbol(currencyCode);
  const numLocale = currencyCode === "INR" ? "en-IN" : "en-US";
  const formatAmount = (amount: number) =>
    pdfSymbol + Number(amount).toLocaleString(numLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Add safety checks
  if (!invoiceData) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text>No invoice data available</Text>
        </Page>
      </Document>
    );
  }

  const invoice = extractInvoicePDFData(invoiceData);
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const subtotal = Number(invoice?.subTotal) || 0;
  const totalTax = Number(invoice?.totalTax) || 0;
  const grandTotal = Number(invoice?.grandTotal) || 0;

  // Use actual tax percentage from form data
  const getTaxPercentage = (item: any) => {
    return Number(item?.tax || 0);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>
              {invoice?.legalEntityData?.legal_name || invoice?.legalEntityData?.item?.legal_name}
            </Text>
            <Text style={styles.companyAddress}>
              {legalEntity?.item?.address}
            </Text>
            <Text style={styles.companyAddress}>
              {[
                legalEntity?.item?.city,
                legalEntity?.item?.state,
                legalEntity?.item?.zip_code,
                legalEntity?.item?.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
            {legalEntity?.item?.website ? (
              <Text style={styles.companyAddress}>{legalEntity.item.website}</Text>
            ) : null}
          </View>
          <View style={styles.invoiceInfo}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoice_number}>
              Invoice #: {invoice?.invoice_number ? `${invoice.invoice_number}-${moment(invoice.invoice_date).format("YYYY")}` : ""}
            </Text>
            <Text style={styles.invoice_date}>
              Invoice Date:{" "}
              {invoice?.invoice_date
                ? moment(invoice.invoice_date).format("DD-MM-YYYY")
                : ""}
            </Text>
          </View>
        </View>

        {/* Billing and Shipping Information */}
        <View style={styles.billingSection}>
          <View style={styles.billTo}>
            <Text style={styles.sectionTitle}>Bill To:</Text>
            <Text style={styles.sectionText}>
              {invoice?.customerData?.customer_name}
            </Text>
            <Text style={styles.sectionText}>{customer?.item?.customer_address}</Text>
            <Text style={styles.sectionText}>
              {[
                customer?.item?.city,
                customer?.item?.state,
                customer?.item?.zip_code,
                customer?.item?.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
          </View>
          <View style={styles.shipTo}>
            <Text style={styles.sectionTitle}>Ship To:</Text>
            <Text style={styles.sectionText}>{locations?.location}</Text>
            <Text style={styles.sectionText}>{locations?.item?.address}</Text>
            <Text style={styles.sectionText}>
              {[
                locations?.item?.city,
                locations?.item?.state,
                locations?.item?.zip_code,
                locations?.item?.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View
              style={[
                styles.tableCell,
                styles.colNumber,
                styles.tableHeaderCell,
              ]}
            >
              <Text>#</Text>
            </View>
            <View
              style={[
                styles.tableCell,
                styles.colDescription,
                styles.tableHeaderCell,
              ]}
            >
              <Text>Item & Description</Text>
            </View>
            <View
              style={[styles.tableCell, styles.colQty, styles.tableHeaderCell]}
            >
              <Text>Qty</Text>
            </View>
            <View
              style={[styles.tableCell, styles.colRate, styles.tableHeaderCell]}
            >
              <Text>Rate</Text>
            </View>
            <View
              style={[
                styles.tableCell,
                styles.colIgstPercent,
                styles.tableHeaderCell,
              ]}
            >
              <Text>IGST (%)</Text>
            </View>
            <View
              style={[
                styles.tableCell,
                styles.colIgstAmount,
                styles.tableHeaderCell,
              ]}
            >
              <Text>IGST Amt</Text>
            </View>
            <View
              style={[
                styles.tableCell,
                styles.colIgstPercent,
                styles.tableHeaderCell,
              ]}
            >
              <Text>Discount (%)</Text>
            </View>
            <View
              style={[
                styles.tableCell,
                styles.colIgstAmount,
                styles.tableHeaderCell,
              ]}
            >
              <Text>Discount Amt</Text>
            </View>
            <View
              style={[
                styles.tableCellLast,
                styles.colAmount,
                styles.tableHeaderCell,
              ]}
            >
              <Text>Amount</Text>
            </View>
          </View>

          {/* Table Body */}
          {items.length > 0 ? (
            items.map((item: any, idx: number) => {
              const taxPercent = getTaxPercentage(item);
              const taxAmount =
                (Number(item?.price || 0) *
                  Number(item?.quantity || 0) *
                  taxPercent) /
                100;
              const itemTotal =
                Number(item?.price || 0) * Number(item?.quantity || 0) +
                taxAmount;

              return (
                <View
                  key={idx}
                  style={idx % 2 === 0 ? styles.tableRow : styles.tableRowEven}
                >
                  <View style={[styles.tableCell, styles.colNumber]}>
                    <Text>{idx + 1}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colDescription]}>
                    <Text style={{ fontWeight: "bold", marginBottom: 2 }}>
                      {item?.item_name || item?.product || ""}
                    </Text>
                    {item?.item_description && (
                      <Text style={{ color: "#000000" }}>
                        {item.item_description}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.tableCell, styles.colQty]}>
                    <Text>{item?.quantity || 0}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colRate]}>
                    <Text>{formatAmount(item?.price || 0)}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colIgstPercent]}>
                    <Text>{taxPercent}%</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colIgstAmount]}>
                    <Text>{formatAmount(taxAmount)}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colIgstPercent]}>
                    <Text>{item?.discount_rate || 0}%</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colIgstAmount]}>
                    <Text>{formatAmount(item?.discount_amount || 0)}</Text>
                  </View>
                  <View style={[styles.tableCellLast, styles.colAmount]}>
                    <Text>{formatAmount(itemTotal)}</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.tableRow}>
              <View
                style={[
                  styles.tableCellLast,
                  { width: "100%", textAlign: "center" },
                ]}
              >
                <Text style={{ textAlign: "center", color: "#000000" }}>
                  No items added yet
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Totals Section */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sub Total:</Text>
              <Text style={styles.totalValue}>{formatAmount(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax:</Text>
              <Text style={styles.totalValue}>{formatAmount(totalTax)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount:</Text>
              <Text style={styles.totalValue}>{formatAmount(totalTax)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{invoice?.adjustable_label || "Adjustable"}:</Text>
              <Text style={styles.totalValue}>{formatAmount(invoice?.adjustable_value || 0)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalLabel}>{formatAmount(grandTotal)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Balance Due:</Text>
              <Text style={styles.grandTotalLabel}>
                {formatAmount(grandTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* Amount in Words */}
        <View style={styles.amountInWords}>
          <Text style={styles.amountInWordsText}>
            <Text style={{ fontWeight: "bold" }}>Total In Words:</Text>{" "}
            <Text style={{ fontWeight: "normal" }}>
              {convertToWords(grandTotal, currencyCode)}
            </Text>
          </Text>
        </View>

        {/* Notes */}
        {invoice?.notes ? (
          <View style={styles.bankDetails}>
            <Text style={styles.bankDetailsTitle}>Notes:</Text>
            <Text style={styles.bankDetailsText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* Terms & Conditions */}
        <View style={styles.termsConditions}>
          <Text style={styles.bankDetailsTitle}>Terms & Conditions:</Text>
          <Text style={styles.termsText}>
            {invoice?.terms_and_conditions || ""}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footerBrand} fixed>
          <Text>Created with Fabriq Books</Text>
        </View>
      </Page>
    </Document>
  );
};

export const InvoicePDFViewer = ({
  invoiceData,
  currencySymbol = "$",
}: any) => {
  if (!invoiceData) {
    return (
      <div
        style={{
          width: "100%",
          height: "800px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #ccc",
        }}
      >
        <div>No invoice data available</div>
      </div>
    );
  }

  const data = extractInvoicePDFData(invoiceData);
  if (!data?.invoice_number) {
    return (
      <div
        style={{
          width: "100%",
          height: "800px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #ccc",
        }}
      >
        <div>Invalid invoice data</div>
      </div>
    );
  }

  return (
    <PDFViewer style={{ width: "100%", height: "800px" }}>
      <InvoicePDF invoiceData={data} currencySymbol={currencySymbol} />
    </PDFViewer>
  );
};

export const InvoicePDFDocument = ({
  invoiceData,
  currencyCode = "INR",
  currencySymbol = "₹",
  products,
  legalEntity,
  customer,
  locations,
}: any) => {
  if (!invoiceData) return null;
  const data = extractInvoicePDFData(invoiceData);
  if (!data?.invoice_number) return null;
  return (
    <InvoicePDF
      invoiceData={data}
      currencyCode={currencyCode}
      currencySymbol={currencySymbol}
      products={products}
      legalEntity={legalEntity}
      customer={customer}
      locations={locations}
    />
  );
};
