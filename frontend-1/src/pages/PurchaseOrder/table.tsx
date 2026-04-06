import React from 'react'

import { getListStatusColor, getStatusText } from '@/components/purchase-requisition/RequisitionStatus'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ActionButtons } from '@/components/ui/action-buttons'

function PurchaseOrderTable({ data, handleAction }) {
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>PO Date</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Purchase Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data && data?.map((item) => (
                        < TableRow key={item.id} >
                            <TableCell>{new Date(item?.purchase_orders[0]?.po_date).toLocaleDateString('en-GB')}</TableCell>
                            <TableCell className="font-medium">{item?.purchase_orders[0]?.po_number}</TableCell>
                            <TableCell className="font-medium">{item?.purchase_orders[0]?.supplier_details?.supplier_name}</TableCell>
                            <TableCell>₹{item?.purchase_orders[0]?.total_price?.toLocaleString()}</TableCell>
                            <TableCell>
                                <span className={cn("px-2 py-1 rounded-full text-xs font-medium", getListStatusColor(item.current_state))}>
                                    {getStatusText(item.current_state)}
                                </span>
                            </TableCell>
                            <TableCell>
                                <ActionButtons
                                    id={item.id}
                                    onView={(id) => handleAction(item?.purchase_orders[0]?.id, item.current_state)}
                                />
                            </TableCell>
                        </TableRow>
                    ))}          {!data || data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                                No orders found matching the criteria.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div >
    )
}

export default PurchaseOrderTable