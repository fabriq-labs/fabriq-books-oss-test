import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatUSD } from "./utils/helper";
import dayjs from "dayjs";

interface InvoiceReviewDocumentProps {
  formData: {
    invoice_number: string;
    invoice_date: string;
    legalEntityData?: any;
    customerData?: any;
    locationData?: any;
    items: Array<{
      item_name?: string;
      item_description?: string;
      period?: string;
      quantity: number | string;
      price: number | string;
      tax: number | string;
      total: number;
    }>;
    subTotal: number;
    totalTax: number;
    grandTotal: number;
  };
}

const InvoiceReviewDocument: React.FC<InvoiceReviewDocumentProps> = ({
  formData,
}) => {
  return (
    <Card className="max-w-4xl mx-auto bg-white shadow-lg">
      <CardContent className="p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">INVOICE</h1>
          <div className="text-lg font-semibold text-primary">
            Invoice Number: {formData.invoice_number}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Date:{" "}
            {formData.invoice_date
              ? dayjs(formData.invoice_date).format("DD-MM-YYYY")
              : "-"}
          </div>
        </div>

        {/* Company and Customer Information */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Legal Entity / Seller */}
          <div>
            <h3 className="text-sm font-bold text-gray-600 mb-3 uppercase tracking-wide">
              Bill From:
            </h3>
            <div className="space-y-1 text-sm">
              <div className="font-semibold">
                {formData.legalEntityData?.item?.legal_name ||
                  formData.legalEntityData?.legal_name ||
                  formData.legalEntityData?.item?.organization_name ||
                  "-"}
              </div>
              {formData.legalEntityData?.item && (
                <div className="text-gray-600 mt-1 space-y-0.5">
                  {(formData.legalEntityData.item.address ||
                    formData.legalEntityData.item.city) && (
                    <div>
                      {[
                        formData.legalEntityData.item.address,
                        formData.legalEntityData.item.city,
                        formData.legalEntityData.item.state,
                        formData.legalEntityData.item.zip_code,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                  {formData.legalEntityData.item.country && (
                    <div>{formData.legalEntityData.item.country}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Customer / Bill To */}
          <div>
            <h3 className="text-sm font-bold text-gray-600 mb-3 uppercase tracking-wide">
              Bill To:
            </h3>
            <div className="space-y-1 text-sm">
              <div className="font-semibold">
                {formData.customerData?.item?.customer_name ||
                  formData.customerData?.customer_name ||
                  "-"}
              </div>
              {formData.customerData?.item && (
                <div className="text-gray-600 mt-1 space-y-0.5">
                  {(formData.customerData.item.address ||
                    formData.customerData.item.city) && (
                    <div>
                      {[
                        formData.customerData.item.address,
                        formData.customerData.item.city,
                        formData.customerData.item.state,
                        formData.customerData.item.zip_code,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                  {formData.customerData.item.country && (
                    <div>{formData.customerData.item.country}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        {formData.locationData && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-600 mb-2 uppercase tracking-wide">
              Location
            </h3>
            <div className="text-sm">
              {formData.locationData?.item?.location ||
                formData.locationData?.location ||
                formData.locationData?.item?.address ||
                [formData.locationData?.item?.city, formData.locationData?.item?.state]
                  .filter(Boolean)
                  .join(", ") ||
                "-"}
            </div>
          </div>
        )}

        <Separator className="my-6" />

        {/* Line Items Table */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-gray-600 mb-4 uppercase tracking-wide">
            Invoice Items
          </h3>
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-700 border-b">
                    Product
                  </th>
                  <th className="text-center p-3 font-semibold text-gray-700 border-b w-20">
                    Period
                  </th>
                  <th className="text-center p-3 font-semibold text-gray-700 border-b w-20">
                    Qty
                  </th>
                  <th className="text-right p-3 font-semibold text-gray-700 border-b w-24">
                    Price
                  </th>
                  <th className="text-right p-3 font-semibold text-gray-700 border-b w-20">
                    Tax (%)
                  </th>
                  <th className="text-right p-3 font-semibold text-gray-700 border-b w-28">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {formData.items?.length > 0 ? (
                  formData.items.map((item, index) => (
                    <tr
                      key={item.item_name || index}
                      className="border-b border-gray-200"
                    >
                      <td className="p-3">
                        <div className="font-medium">
                          {item.item_name || "-"}
                        </div>
                        {item.item_description && (
                          <div className="text-xs text-gray-500 mt-1">
                            {item.item_description}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">{item.period || "-"}</td>
                      <td className="p-3 text-center">
                        {Number(item.quantity) || 0}
                      </td>
                      <td className="p-3 text-right">
                        {formatUSD(Number(item.price) || 0)}
                      </td>
                      <td className="p-3 text-right">
                        {Number(item.tax) || 0}%
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatUSD(Number(item.total) || 0)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-gray-500"
                    >
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
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600">Sub Total:</span>
                <span className="font-medium">
                  {formatUSD(formData.subTotal || 0)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="font-medium text-gray-600">Total Tax:</span>
                <span className="font-medium">
                  {formatUSD(formData.totalTax || 0)}
                </span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-gray-300">
                <span className="font-bold text-lg">Grand Total:</span>
                <span className="font-bold text-lg text-primary">
                  {formatUSD(formData.grandTotal || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default InvoiceReviewDocument;
