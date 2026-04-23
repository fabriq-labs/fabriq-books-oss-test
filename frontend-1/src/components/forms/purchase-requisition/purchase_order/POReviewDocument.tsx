import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { format, isValid } from 'date-fns';
import moment from 'moment';
import { formatCurrency } from '@/lib/formatters';
interface POReviewDocumentProps {
    form: UseFormReturn<any>;
    details: any;
    totalPOAmount: any;
}

const POReviewDocument: React.FC<POReviewDocumentProps> = ({ form, details, totalPOAmount }) => {
    const formData = form.getValues();


    return (
        <Card className="max-w-4xl mx-auto bg-white shadow-lg">
            <CardContent className="p-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">PURCHASE ORDER</h1>
                    <div className="text-lg font-semibold text-primary">
                        PO Number:{details?.po_number}
                    </div>
                </div>

                {/* Company and Supplier Information */}
                <div className="grid grid-cols-2 gap-8 mb-8">
                    {/* Buyer Information */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-600 mb-3 uppercase tracking-wide">Ship To / Bill To:</h3>
                        <div className="space-y-1 text-sm">
                            <div className="font-semibold">{details?.legal_entity?.legal_name}</div>
                            <div> {details?.legal_entity?.address}</div>
                            <div> {[details?.legal_entity?.city, details?.legal_entity?.state, details?.legal_entity?.zip_code].filter(Boolean).join(', ')}</div>
                            <div> {details?.legal_entity?.country}</div>
                            {/* <div> {details?.organization?.website}</div> */}
                            {/* <div>Website:{details?.organization?.website}</div> */}
                        </div>
                    </div>

                    {/* Vendor Information */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-600 mb-3 uppercase tracking-wide">Vendor:</h3>
                        <div className="space-y-1 text-sm">
                            <div className="font-semibold">{details?.supplier_details?.supplier_name}</div>
                            {details?.supplier_details && (
                                <div>Contact: {details?.supplier_details?.supplier_address}</div>
                            )}
                            {details?.supplier_details && (
                                <div>Email: {details?.supplier_details?.primary_email}</div>
                            )}
                            {details?.supplier_details && (
                                <div>Phone:  {details?.supplier_details?.primary_phone}</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Order Details */}
                <div className="grid grid-cols-3 gap-6 mb-8">
                    <div>
                        <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">PO Date</div>
                        <div className="text-sm font-medium">
                            {details?.po_date ? moment(details.po_date).format("DD-MM-YYYY") : ''}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">Need By Date</div>
                        <div className="text-sm font-medium">
                            {details?.need_by_date ? moment(details.need_by_date).format("DD-MM-YYYY") : ''}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">Transmission Mode</div>
                        <div className="text-sm font-medium">{details?.transmission_mode || "Email"}</div>
                    </div>
                </div>

                {/* {details?.purchase_reason && (
                    <div className="mb-8">
                        <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Purchase Reason</div>
                        <div className="text-sm bg-gray-50 p-3 rounded border">{details?.purchase_reason}</div>
                    </div>
                )} */}

                <Separator className="my-6" />

                {/* Line Items Table */}
                <div className="mb-8">
                    <h3 className="text-sm font-bold text-gray-600 mb-4 uppercase tracking-wide">Items Ordered</h3>
                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="text-left p-3 font-semibold text-gray-700 border-b">Item Description</th>
                                    <th className="text-center p-3 font-semibold text-gray-700 border-b w-20">UOM</th>
                                    <th className="text-center p-3 font-semibold text-gray-700 border-b w-20">Qty</th>
                                    <th className="text-right p-3 font-semibold text-gray-700 border-b w-24">Unit Price</th>
                                    <th className="text-right p-3 font-semibold text-gray-700 border-b w-28">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {details?.purchase_order_item?.length > 0 ? (
                                    details.purchase_order_item.map((item, index) => (
                                        <tr key={item.id || index} className="border-b border-gray-200">
                                            <td className="p-3">
                                                <div className="font-medium">{item.product?.item_name}</div>
                                                {item.product?.item_description && (
                                                    <div className="text-xs text-gray-500 mt-1">{item.product.item_description}</div>
                                                )}

                                                {/* Supplier */}
                                                {item.supplier?.supplier_name && (
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Supplier: {item.supplier.supplier_name}
                                                    </div>
                                                )}

                                                {/* Need by date */}
                                                {item.need_by_date && (
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Need by Date:
                                                        {item?.need_by_date ? moment(item.need_by_date).format("DD-MM-YYYY") : ''}
                                                    </div>
                                                )}
                                            </td>
                                            {/* UOM */}
                                            <td className="p-3 text-center">{item?.product?.uom?.name}</td>

                                            {/* Quantity */}
                                            <td className="p-3 text-center">{item.quantity}</td>

                                            {/* Rate */}
                                            <td className="p-3 text-right">
                                                ₹{item.rate?.toLocaleString()}
                                            </td>

                                            {/* Line Total */}
                                            <td className="p-3 text-right font-medium">
                                                {/* ₹{item.item_total?.toLocaleString()} */}
                                                {item.item_total ? formatCurrency(item.item_total) : ""}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-gray-500">
                                            No line items added yet
                                        </td>
                                    </tr>
                                )}
                            </tbody>

                        </table>
                    </div>
                </div>

                {/* Totals Section */}
                <div className="flex justify-end mb-8">
                    <div className="w-80">
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between py-2 border-t border-gray-300">
                                <span className="font-bold text-lg">TOTAL AMOUNT:</span>
                                <span className="font-bold text-lg text-primary">{details?.total_price ? formatCurrency(details.total_price) : ""}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Terms and Conditions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-gray-600">
                    {details?.payment_terms && (
                        <div>
                            <div className="font-bold uppercase tracking-wide mb-2">Payment Terms</div>
                            <div>{details?.payment_terms?.payment_terms}</div>
                        </div>
                    )}
                    {details.shipping_method && (
                        <div>
                            <div className="font-bold uppercase tracking-wide mb-2">Shipping Method</div>
                            <div>{details?.shipping_method?.shipping_method}</div>
                        </div>
                    )}
                    {details.shipping_terms && (
                        <div>
                            <div className="font-bold uppercase tracking-wide mb-2">Shipping Terms</div>
                            <div>{details?.shipping_terms?.shipping_terms}</div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-12 pt-6 border-t border-gray-300">
                    <div className="grid grid-cols-2 gap-8 text-xs text-gray-600">
                        <div>
                            <div className="font-bold mb-2">AUTHORIZED BY:</div>
                            <div className="border-b border-gray-300 mb-2 h-8"></div>
                            <div>Signature</div>
                        </div>
                        <div>
                            <div className="font-bold mb-2">DATE:</div>
                            <div className="border-b border-gray-300 mb-2 h-8">{details?.created_at ? moment(details?.created_at).format("DD-MM-YYYY") : ''}</div>

                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default POReviewDocument;