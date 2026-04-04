import React from 'react'

import { getListStatusColor, getStatusText } from '@/components/purchase-requisition/RequisitionStatus'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ActionButtons } from '@/components/ui/action-buttons'

function RequisitionTable({ data, handleAction }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PR Date</TableHead>
            <TableHead>PR Number</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>PR Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data && data?.map((item) => {
            // Get the earliest history entry (first action)
            const firstHistory = item.history?.slice().sort(
              (a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
            )[0];

            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {new Date(item?.purchase_requisitions[0]?.pr_date).toLocaleDateString('en-GB')}
                </TableCell>
                <TableCell className="font-medium">
                  {item?.purchase_requisitions[0]?.pr_number}
                </TableCell>
                <TableCell>
                  {firstHistory?.performed_by_name}
                </TableCell>
                <TableCell>
                  ₹{item?.purchase_requisitions[0]?.total_price?.toLocaleString()}
                </TableCell>
                <TableCell>
                  <span className={cn("px-2 py-1 rounded-full text-xs font-medium", getListStatusColor(item?.current_state))}>
                    {getStatusText(item?.current_state)}
                  </span>
                </TableCell>
                <TableCell>
                  <ActionButtons
                    id={item.id}
                    onView={(id) => handleAction(item?.purchase_requisitions[0]?.id, item?.current_state)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
          {!data || data.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                No orders found matching the criteria.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default RequisitionTable