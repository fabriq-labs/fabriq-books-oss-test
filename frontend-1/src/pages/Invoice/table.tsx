import React from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { getListStatusColor, getStatusText } from '@/components/purchase-requisition/RequisitionStatus'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ActionButtons } from '@/components/ui/action-buttons'

interface InvoiceTableProps {
    data: any[];
    handleAction: (id: string, status: any) => void;
    sortOption?: { field?: string; direction?: 'asc' | 'desc' };
    setSortOption?: (sort: { field?: string; direction?: 'asc' | 'desc' }) => void;
}

function InvoiceTable({ data, handleAction, sortOption = {}, setSortOption }: InvoiceTableProps) {
    const handleSort = (field: string) => {
        if (!setSortOption) return;
        
        if (sortOption.field === field) {
            // Toggle direction if same field
            setSortOption({
                field,
                direction: sortOption.direction === 'asc' ? 'desc' : 'asc'
            });
        } else {
            // New field, set to ascending
            setSortOption({
                field,
                direction: 'asc'
            });
        }
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortOption.field !== field) {
            return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
        }
        return sortOption.direction === 'asc' 
            ? <ArrowUp className="ml-2 h-4 w-4" />
            : <ArrowDown className="ml-2 h-4 w-4" />;
    };

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead 
                            className="cursor-pointer hover:bg-gray-50 select-none"
                            onClick={() => handleSort('invoice_number')}
                        >
                            <div className="flex items-center">
                                Invoice Number
                                <SortIcon field="invoice_number" />
                            </div>
                        </TableHead>
                        <TableHead 
                            className="cursor-pointer hover:bg-gray-50 select-none"
                            onClick={() => handleSort('invoice_date')}
                        >
                            <div className="flex items-center">
                                Date
                                <SortIcon field="invoice_date" />
                            </div>
                        </TableHead>
                        <TableHead 
                            className="cursor-pointer hover:bg-gray-50 select-none"
                            onClick={() => handleSort('invoice_total')}
                        >
                            <div className="flex items-center">
                                Total
                                <SortIcon field="invoice_total" />
                            </div>
                        </TableHead>
                        <TableHead 
                            className="cursor-pointer hover:bg-gray-50 select-none"
                            onClick={() => handleSort('current_state')}
                        >
                            <div className="flex items-center">
                                Status
                                <SortIcon field="current_state" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data && data?.map((item) => (
                        <TableRow key={item.id}>
                            <TableCell className="font-medium">{item?.invoices[0]?.invoice_number}</TableCell>
                            <TableCell>{new Date(item?.invoices[0]?.invoice_date).toLocaleDateString('en-GB')}</TableCell>
                            <TableCell>₹{item?.invoices[0]?.invoice_total?.toLocaleString()}</TableCell>
                            <TableCell>
                                <span className={cn("px-2 py-1 rounded-full text-xs font-medium", getListStatusColor(item.current_state))}>
                                    {getStatusText(item.current_state)}
                                </span>
                            </TableCell>
                            <TableCell>
                                <ActionButtons
                                    id={item.id}
                                    onView={(id) => handleAction(item?.invoices[0]?.id, item.current_state)}
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
        </div>
    )
}

export default InvoiceTable