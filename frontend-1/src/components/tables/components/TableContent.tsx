
import React from 'react';
import { Eye, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface DataItem {
  id: string;
  number: string;
  date: string;
  reason: string;
  total: number;
  status: string;
}

interface TableContentProps {
  data: DataItem[];
  onDelete: (id: string) => void;
  onView: (id: string) => void;
}

const TableContent: React.FC<TableContentProps> = ({ data, onDelete, onView }) => {
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PR Number</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="hidden md:table-cell">Reason</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center h-24">
                No records found
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.number}</TableCell>
                <TableCell>{item.date}</TableCell>
                <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                  {item.reason}
                </TableCell>
                <TableCell>${item.total.toLocaleString()}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    item.status === 'Approved' 
                      ? 'bg-green-100 text-green-800' 
                      : item.status === 'Rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {item.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onView(item.id)}
                      className="h-8 w-8"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(item.id)}
                      className="h-8 w-8 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default TableContent;
