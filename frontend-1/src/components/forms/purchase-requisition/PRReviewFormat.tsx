import React from "react";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format, isValid } from "date-fns";
import moment from "moment";
import { formatCurrency } from "@/lib/formatters";
interface PRReviewDocumentProps {
  form: UseFormReturn<any>;
  details: any;
  workflowContext: any;
  isBuyer?: boolean;
  isAdmin?: boolean;
  onNavigateToLineItems?: () => void;
  onNavigateToBudgetItems?: () => void;
}

const PRReviewDocument: React.FC<PRReviewDocumentProps> = ({
  form,
  details,
  workflowContext,
  isBuyer,
  isAdmin,
  onNavigateToLineItems,
  onNavigateToBudgetItems,
}) => {
  const formData = form.watch();

  return (
    <>
      <div className="max-w-4xl mx-auto bg-white text-black p-8 shadow-lg">
        {/* Header */}
        <div className="text-center mb-8 pb-6 border-b-2 border-gray-800">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            PURCHASE REQUISITION
          </h1>
          <div className="text-sm text-gray-600">
            Request for Purchase Authorization
          </div>
        </div>

        {/* Document Information */}
        <div className="grid grid-cols-3 gap-8 mb-8">
          <div>
            <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
              PR Number
            </div>
            <div className="text-lg font-bold border-b border-gray-300 pb-1">
              {details?.pr_number}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-600 uppercase tracking-wide my-1">
              PR Date
            </div>
            <div className="text-sm font-medium border-b border-gray-300 pb-1">
              {/* {formatDate(details?.pr_date)} */}
              {details?.pr_date
                ? moment(details.pr_date).format("DD-MM-YYYY")
                : ""}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-600 uppercase tracking-wide my-1">
              PR Total
            </div>
            <div className="text-sm font-medium border-b border-gray-300 pb-1">
              {details?.total_price ? formatCurrency(details?.total_price) : ""}
            </div>
          </div>
        </div>

        {/* Requester Information and Purchase Purpose */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <Card className="border-gray-300">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 border-b border-gray-200 pb-2">
                Requester Information
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Requested By
                  </div>
                  <div className="text-sm font-medium">
                    {" "}
                    {details?.create_user?.email}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Department
                  </div>
                  <div className="text-sm font-medium">
                    {" "}
                    {details?.create_user?.department?.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Legal Entity
                  </div>
                  <div className="text-sm font-medium">
                    {details?.legal_entity?.legal_name}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Delivery Location
                  </div>
                  <div className="text-sm font-medium">
                    {" "}
                    {details?.location?.location}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-300">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 border-b border-gray-200 pb-2">
                Purchase Purpose
              </h3>
              <div className="text-sm text-gray-800 min-h-[120px] p-3 bg-gray-50 rounded border">
                {details?.purchase_reason}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Line Items Table */}
        <Card className="mb-6 border-gray-300">
          <CardContent className="p-0">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide p-6 pb-4 border-b border-gray-200">
              {isBuyer || isAdmin ? (
                <a
                  href="#"
                  className="text-primary hover:text-primary/80 cursor-pointer underline"
                  onClick={(e) => {
                    e.preventDefault();
                    if (onNavigateToLineItems) {
                      onNavigateToLineItems();
                    }
                  }}
                >
                  Items Requested
                </a>
              ) : (
                "Items Requested"
              )}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="text-left p-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                      Item Code
                    </th>
                    <th className="text-left p-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                      Description
                    </th>
                    <th className="text-center p-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                      UOM
                    </th>
                    <th className="text-center p-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                      Qty
                    </th>
                    <th className="text-right p-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                      Unit Price
                    </th>
                    <th className="text-center p-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                      Need By Date
                    </th>
                    <th className="text-right p-3 text-xs font-bold text-gray-600 uppercase tracking-wide">
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {details?.items?.map((item, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="p-3">
                        <div className="text-sm font-medium text-gray-900">
                          {item?.product?.item_code}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm font-medium text-gray-900">
                          {item?.product?.item_description}
                        </div>
                        {item?.cost_center && (
                          <div className="text-xs text-gray-500 mt-1">
                            Cost Center: {item?.cost_center?.cost_center}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center text-sm">
                        {item?.product?.uom?.name || item?.product?.uom || "-"}
                      </td>
                      <td className="p-3 text-center text-sm">
                        {item?.quantity}
                      </td>
                      <td className="p-3 text-right text-sm">
                        {item?.rate ? formatCurrency(item?.rate) : ""}
                      </td>
                      <td className="p-3 text-center text-sm">
                        {/* {item?.need_by_date ? formatDate(item?.need_by_date) : '-'} */}
                        {item?.need_by_date
                          ? moment(item.need_by_date).format("DD-MM-YYYY")
                          : "-"}
                      </td>
                      <td className="p-3 text-right text-sm font-medium">
                        {item?.item_total
                          ? formatCurrency(item?.item_total)
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>

                <tfoot className="bg-gray-50">
                  <tr>
                    <td
                      colSpan={6}
                      className="p-3 text-right text-sm font-bold text-gray-700 uppercase tracking-wide"
                    >
                      Total Amount:
                    </td>
                    <td className="p-3 text-right text-lg font-bold text-primary">
                      {details?.total_price
                        ? formatCurrency(details?.total_price)
                        : ""}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <Card className="border-gray-300">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 border-b border-gray-200 pb-2">
                {isBuyer || isAdmin ? (
                  <a
                    href="#"
                    className="text-primary hover:text-primary/80 cursor-pointer underline"
                    onClick={(e) => {
                      e.preventDefault();
                      if (onNavigateToBudgetItems) {
                        onNavigateToBudgetItems();
                      }
                    }}
                  >
                    Budget Information
                  </a>
                ) : (
                  "Budget Information"
                )}
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    Budgeted
                  </div>
                  <div className="text-sm font-medium">
                    {details?.on_budget ? "Yes" : "No"}
                  </div>
                </div>
                {details?.on_budget && (
                  <>
                    <div>
                      <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                        Budget Level
                      </div>
                      <div className="text-sm font-medium">
                        {details?.budget_level}
                      </div>
                    </div>
                    {details?.budget_level === "Header" && (
                      <>
                        <div>
                          <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                            Cost Center
                          </div>
                          <div className="text-sm font-medium">
                            {" "}
                            {details?.cost_center?.cost_center}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                            Budget Period
                          </div>
                          <div className="text-sm font-medium">
                            {details?.budget_period_obj?.budget_period}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-300">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4 border-b border-gray-200 pb-2">
                {isBuyer || isAdmin ? (
                  <a
                    href="#"
                    className="text-primary hover:text-primary/80 cursor-pointer underline"
                    onClick={(e) => {
                      e.preventDefault();
                      if (onNavigateToBudgetItems) {
                        onNavigateToBudgetItems();
                      }
                    }}
                  >
                    Project Information
                  </a>
                ) : (
                  " Project Information"
                )}
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    For Project
                  </div>
                  <div className="text-sm font-medium">
                    {details?.on_project ? "Yes" : "No"}
                  </div>
                </div>
                {details?.on_project && (
                  <div>
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                      Project Name
                    </div>
                    <div className="text-sm font-medium">
                      {" "}
                      {details?.project_master_obj?.project_name}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Approval Section */}
        <div className="grid grid-cols-3 gap-8 mt-8 pt-6 border-t-2 border-gray-800">
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 pb-2">
              {workflowContext?.history?.find(
                (h) =>
                  h.from_state === "Draft" && h.to_state === "Manager Review",
              )
                ? moment(
                  workflowContext?.history.find(
                    (h) =>
                      h.from_state === "Draft" &&
                      h.to_state === "Manager Review",
                  ).performed_at,
                ).format("DD-MM-YYYY")
                : ""}
            </div>
            <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
              Requested By
            </div>
            <div className="text-xs text-gray-500 mt-1">Date</div>
          </div>
          {/* Department Approval */}
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 pb-2">
              {workflowContext?.history?.find(
                (h) =>
                  h.from_state === "Manager Review" &&
                  h.to_state === "Buyer Review",
              )
                ? moment(
                  workflowContext?.history.find(
                    (h) =>
                      h.from_state === "Manager Review" &&
                      h.to_state === "Buyer Review",
                  ).performed_at,
                ).format("DD-MM-YYYY")
                : ""}
            </div>
            <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
              Department Approval
            </div>
            <div className="text-xs text-gray-500 mt-1">Date</div>
          </div>

          {/* Finance Approval */}
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 pb-2">
              {workflowContext?.history?.find(
                (h) =>
                  h.from_state === "Buyer Review" && h.to_state === "Delivery",
              )
                ? moment(
                  workflowContext?.history.find(
                    (h) =>
                      h.from_state === "Buyer Review" &&
                      h.to_state === "Delivery",
                  ).performed_at,
                ).format("DD-MM-YYYY")
                : ""}
            </div>
            <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">
              Finance Approval
            </div>
            <div className="text-xs text-gray-500 mt-1 pb-2">Date</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PRReviewDocument;
