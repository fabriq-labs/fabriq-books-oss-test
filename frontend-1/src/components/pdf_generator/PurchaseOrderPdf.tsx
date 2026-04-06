'use client';
import React from 'react';
import { Document, Page, Text, View, StyleSheet, PDFViewer } from '@react-pdf/renderer';
import moment from 'moment';

// Extract the fields we need, modeled after POReviewDocument.tsx
export const extractPDFData = (data: any): any => {
    if (!data || typeof data !== 'object') return {};

    return {
        po_number: data.po_number,
        po_date: data.po_date,
        need_by_date: data.need_by_date,
        transmission_mode: data.transmission_mode,
        purchase_reason: data.purchase_reason,
        created_at: data.created_at,

        organization: data.organization ? {
            legal_name: data.organization.legal_name,
            address: data.organization.address,
            city: data.organization.city,
            country: data.organization.country,
            state: data.organization.state,
            zip_code: data.organization.zip_code,
            website: data.organization.website,
        } : null,

        supplier_details: data.supplier_details ? {
            supplier_name: data.supplier_details.supplier_name,
            supplier_address: data.supplier_details.supplier_address,
            primary_email: data.supplier_details.primary_email,
            primary_phone: data.supplier_details.primary_phone,
            city: data.supplier_details.city,
            state: data.supplier_details.state,
            zip_code: data.supplier_details.zip_code,
            country: data.supplier_details.country,
            website: data.supplier_details.website,
        } : null,

        location: data.location ? {
            location: data.location.location,
            address: data.location.address,
            city: data.location.city,
            state: data.location.state,
            zip_code: data.location.zip_code,
            country: data.location.country,
        } : null,

        payment_terms: data.payment_terms ? (typeof data.payment_terms === 'string' ? data.payment_terms : data.payment_terms.payment_terms) : null,
        shipping_method: data.shipping_method ? (typeof data.shipping_method === 'string' ? data.shipping_method : data.shipping_method.shipping_method) : null,
        shipping_terms: data.shipping_terms ? (typeof data.shipping_terms === 'string' ? data.shipping_terms : data.shipping_terms.shipping_terms) : null,

        create_user: data.create_user ? { email: data.create_user.email } : null,

        purchase_order_item: Array.isArray(data.purchase_order_item) ? data.purchase_order_item.map((item: any) => ({
            quantity: item.quantity,
            rate: item.rate,
            item_total: item.item_total,
            product: item.product ? {
                item_name: item.product.item_name,
                item_description: item.product.item_description,
                uom: item.product.uom ? { name: item.product.uom.name } : null,
            } : null,
            supplier: item.supplier ? { supplier_name: item.supplier.supplier_name } : null,
            need_by_date: item.need_by_date,
        })) : [],
    };
};

const styles = StyleSheet.create({
    page: { backgroundColor: '#FFFFFF', padding: 30, fontFamily: 'Helvetica' },
    // Header centered
    headerCenter: { textAlign: 'center', marginBottom: 16 },
    poTitle: { fontSize: 20, fontWeight: 'bold', color: '#111111', marginBottom: 4 },
    poNumber: { fontSize: 12, fontWeight: 'bold', color: '#7028a0', marginTop: 5 },

    // Company & Supplier grid
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    col: { width: '48%' },
    sectionTitle: { fontSize: 10, fontWeight: 'bold', color: '#4b5563', marginTop: 7, marginBottom: 6, textTransform: 'uppercase' },
    text: { fontSize: 10, color: '#111827', marginBottom: 2 },
    muted: { fontSize: 9, color: '#6b7280' },

    // Order details
    orderRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, marginBottom: 16 },
    orderCol: { width: '32%' },
    orderLabel: { fontSize: 9, fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase' },
    orderValue: { fontSize: 10, marginTop: 2 },

    // Purchase reason
    reasonBox: { borderWidth: 1, borderColor: '#d1d5db', marginTop: 10, marginBottom: 16 },
    reasonHeader: { backgroundColor: '#f3f4f6', padding: 6, borderBottomWidth: 1, borderBottomColor: '#d1d5db' },
    reasonTitle: { fontSize: 9, fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase' },
    reasonText: { fontSize: 10, padding: 8 },

    // Table
    table: { display: 'flex', width: 'auto', borderWidth: 1, borderColor: '#d1d5db', borderStyle: 'solid', borderRadius: 2, overflow: 'hidden', marginTop: 8, marginBottom: 16, padding: 6 },
    thead: { backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', borderBottomStyle: 'solid' },
    rowBase: { flexDirection: 'row' },
    cell: { padding: 6, fontSize: 10 },
    th: { fontWeight: 'bold', color: '#374151' },
    colDesc: { width: '40%', borderRightWidth: 1, borderRightColor: '#e5e7eb' },
    colUom: { width: '12%', borderRightWidth: 1, borderRightColor: '#e5e7eb', textAlign: 'center' },
    colQty: { width: '12%', borderRightWidth: 1, borderRightColor: '#e5e7eb', textAlign: 'center' },
    colRate: { width: '18%', borderRightWidth: 1, borderRightColor: '#e5e7eb', textAlign: 'right' },
    colTotal: { width: '18%', textAlign: 'right' },

    // Totals
    totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 7, marginBottom: 16 },
    totalsBox: { width: '40%' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#d1d5db' },
    totalLabel: { fontSize: 12, fontWeight: 'bold' },
    totalValue: { fontSize: 12, fontWeight: 'bold', color: '#7028a0' },

    // Separator
    separatorLine: { borderTopWidth: 1, borderTopColor: '#d1d5db', marginTop: 8, marginBottom: 12 },

    // Terms
    termsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 12 },
    termsCol: { width: '32%' },
    termsTitle: { fontSize: 9, fontWeight: 'bold', color: '#4b5563', marginBottom: 4, textTransform: 'uppercase' },
    termsText: { fontSize: 10 },

    // Footer
    footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
    signBox: { width: '45%' },
    signTitle: { fontSize: 9, fontWeight: 'normal', marginBottom: 5 },
    signLine: { height: 10, borderBottomWidth: 1, borderBottomColor: '#d1d5db', marginTop: 5, marginBottom: 2 },
    signHint: { fontSize: 9, color: '#6b7280', marginTop: 1 },
});

const PurchaseOrderPDF = ({ purchaseOrder, currencySymbol = '₹' }: any) => {
    const po = extractPDFData(purchaseOrder);
    const items = Array.isArray(po?.purchase_order_item) ? po.purchase_order_item : [];
    const subtotal = items.reduce((acc: number, it: any) => acc + (Number(it?.item_total) || 0), 0);
    const totalPOAmount = subtotal;

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header centered */}
                <View style={styles.headerCenter}>
                    <Text style={styles.poTitle}>PURCHASE ORDER</Text>
                    <Text style={styles.poNumber}>PO Number: {po?.po_number || ''}</Text>
                </View>

                {/* Company and Supplier Information */}
                <View style={styles.row}>
                    <View style={styles.col}>
                        <Text style={styles.sectionTitle}>Ship To / Bill To:</Text>
                        <Text style={styles.text}>{po?.organization?.legal_name || ''}</Text>
                        <Text style={styles.text}>{po?.organization?.address || ''}</Text>
                        <Text style={styles.text}>{[po?.organization?.city, po?.organization?.state, po?.organization?.zip_code].filter(Boolean).join(', ')}</Text>
                        <Text style={styles.text}>{po?.organization?.country || ''}</Text>
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.sectionTitle}>Vendor:</Text>
                        <Text style={styles.text}>{po?.supplier_details?.supplier_name || ''}</Text>
                        {po?.supplier_details?.supplier_address ? (
                            <Text style={styles.text}>Contact: {po?.supplier_details?.supplier_address}</Text>
                        ) : null}
                        {po?.supplier_details?.primary_email ? (
                            <Text style={styles.text}>Email: {po?.supplier_details?.primary_email}</Text>
                        ) : null}
                        {po?.supplier_details?.primary_phone ? (
                            <Text style={styles.text}>Phone: {po?.supplier_details?.primary_phone}</Text>
                        ) : null}
                    </View>
                </View>

                {/* Order Details */}
                <View style={styles.orderRow}>
                    <View style={styles.orderCol}>
                        <Text style={styles.orderLabel}>PO Date</Text>
                        <Text style={styles.orderValue}>{po?.po_date ? moment(po.po_date).format('DD-MM-YYYY') : ''}</Text>
                    </View>
                    <View style={styles.orderCol}>
                        <Text style={styles.orderLabel}>Need By Date</Text>
                        <Text style={styles.orderValue}>{po?.need_by_date ? moment(po.need_by_date).format('DD-MM-YYYY') : ''}</Text>
                    </View>
                    <View style={styles.orderCol}>
                        <Text style={styles.orderLabel}>Transmission Mode</Text>
                        <Text style={styles.orderValue}>{po?.transmission_mode || 'Email'}</Text>
                    </View>
                </View>

                {/* Purchase Reason */}
                {/* {po?.purchase_reason ? (
                    <>
                        <View style={styles.reasonBox}>
                            <View style={styles.reasonHeader}><Text style={styles.reasonTitle}>Purchase Reason</Text></View>
                            <Text style={styles.reasonText}>{po.purchase_reason}</Text>
                        </View>
                        {/* underline and space after the box */}
                {/* <View style={styles.separatorLine} /> */}
                {/* </>
                ) : null} */}

                {/* Items Ordered */}
                <View>
                    <Text style={styles.sectionTitle}>Items Ordered</Text>
                    {/* space and then table follows (table has marginTop) */}
                    <View style={styles.table}>
                        {/* Header */}
                        <View style={[styles.rowBase, styles.thead]}>
                            <View style={[styles.cell, styles.colDesc, styles.th]}><Text>Item Description</Text></View>
                            <View style={[styles.cell, styles.colUom, styles.th]}><Text>UOM</Text></View>
                            <View style={[styles.cell, styles.colQty, styles.th]}><Text>Qty</Text></View>
                            <View style={[styles.cell, styles.colRate, styles.th]}><Text>Unit Price</Text></View>
                            <View style={[styles.cell, styles.colTotal, styles.th]}><Text>Total</Text></View>
                        </View>
                        {/* Body */}
                        {items.length > 0 ? items.map((it: any, idx: number) => (
                            <View key={idx} style={styles.rowBase}>
                                <View style={[styles.cell, styles.colDesc]}>
                                    <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>{it?.product?.item_name || ''}</Text>
                                    {it?.product?.item_description ? (
                                        <Text style={{ color: '#6b7280', marginBottom: 2 }}>{it.product.item_description}</Text>
                                    ) : null}
                                    {it?.supplier?.supplier_name ? (
                                        <Text style={{ color: '#6b7280', marginBottom: 2 }}>Supplier: {it.supplier.supplier_name}</Text>
                                    ) : null}
                                    {it?.need_by_date ? (
                                        <Text style={{ color: '#6b7280', marginBottom: 2 }}>Need by Date: {moment(it.need_by_date).format('DD-MM-YYYY')}</Text>
                                    ) : null}
                                </View>
                                <View style={[styles.cell, styles.colUom]}><Text>{it?.product?.uom?.name || ''}</Text></View>
                                <View style={[styles.cell, styles.colQty]}><Text>{it?.quantity || 0}</Text></View>
                                <View style={[styles.cell, styles.colRate]}><Text>{currencySymbol}{Number(it?.rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text></View>
                                <View style={[styles.cell, styles.colTotal]}><Text>{currencySymbol}{Number(it?.item_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text></View>
                            </View>
                        )) : (
                            <View style={styles.rowBase}>
                                <View style={[styles.cell, { width: '100%' }]}>
                                    <Text style={{ textAlign: 'center', color: '#6b7280' }}>No line items added yet</Text>
                                </View>
                            </View>
                        )}
                    </View>
                </View>

                {/* Totals */}
                <View style={styles.totalsWrap}>
                    <View style={styles.totalsBox}>
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>TOTAL AMOUNT:</Text>
                            <Text style={styles.totalValue}>{currencySymbol}{totalPOAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                        </View>
                    </View>
                </View>
                {/* Space then separator after totals */}
                <View style={{ height: 8 }} />
                {/* <View style={styles.separatorLine} /> */}
                <View style={{ height: 5 }} />

                {/* Terms and Conditions */}
                <View style={styles.termsRow}>
                    {po?.payment_terms ? (
                        <View style={styles.termsCol}>
                            <Text style={styles.termsTitle}>Payment Terms</Text>
                            <Text style={styles.termsText}>{po.payment_terms}</Text>
                        </View>
                    ) : null}
                    {po?.shipping_method ? (
                        <View style={styles.termsCol}>
                            <Text style={styles.termsTitle}>Shipping Method</Text>
                            <Text style={styles.termsText}>{po.shipping_method}</Text>
                        </View>
                    ) : null}
                    {po?.shipping_terms ? (
                        <View style={styles.termsCol}>
                            <Text style={styles.termsTitle}>Shipping Terms</Text>
                            <Text style={styles.termsText}>{po.shipping_terms}</Text>
                        </View>
                    ) : null}
                </View>
                {/* Space then underline then space after terms */}
                <View style={{ height: 5 }} />
                <View style={styles.separatorLine} />
                <View style={{ height: 5 }} />

                {/* Footer */}
                <View style={styles.footerRow}>
                    <View style={styles.signBox}>
                        <Text style={styles.signTitle}>AUTHORIZED BY</Text>
                        <View style={styles.signLine} />
                        <Text style={styles.signHint}>Signature</Text>
                    </View>
                    <View style={styles.signBox}>
                        <Text style={styles.signTitle}>DATE</Text>
                        {/* Date value placed above the underline */}
                        <Text style={[styles.muted]}>{po?.created_at ? moment(po.created_at).format('DD-MM-YYYY') : ''}</Text>
                        {/* <View style={styles.signLine} /> */}
                        <View style={[styles.signLine, { marginTop: -5 }]} />
                    </View>
                </View>
            </Page>
        </Document>
    );
};

export const PurchaseOrderPDFViewer = ({ purchaseOrder, currencySymbol = '₹' }: any) => {
    if (!purchaseOrder) {
        return (
            <div style={{ width: '100%', height: '800px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc' }}>
                <div>No purchase order data available</div>
            </div>
        );
    }

    const data = extractPDFData(purchaseOrder);
    if (!data?.po_number) {
        return (
            <div style={{ width: '100%', height: '800px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ccc' }}>
                <div>Invalid purchase order data</div>
            </div>
        );
    }

    return (
        <PDFViewer style={{ width: '100%', height: '800px' }}>
            <PurchaseOrderPDF purchaseOrder={data} currencySymbol={currencySymbol} />
        </PDFViewer>
    );
};

export const PurchaseOrderPDFDocument = ({ purchaseOrder, currencySymbol = '₹' }: any) => {
    if (!purchaseOrder) return null;
    const data = extractPDFData(purchaseOrder);
    if (!data?.po_number) return null;
    return <PurchaseOrderPDF purchaseOrder={data} currencySymbol={currencySymbol} />;
};
