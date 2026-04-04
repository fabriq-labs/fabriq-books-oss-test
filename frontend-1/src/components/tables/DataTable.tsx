
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTableProps, DataItem } from './types';
import TableContent from './components/TableContent';
import TablePagination from './components/TablePagination';

export const DataTable: React.FC<DataTableProps> = ({ title, data, onView, onDelete }) => {
  const [activeTab, setActiveTab] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const itemsPerPage = 5;

  // Get active data based on tab
  const activeData = activeTab === 'todos' ? data.todos : data.raisedByMe;
  
  // Apply filters
  const filteredData = statusFilter === 'all' 
    ? activeData 
    : activeData.filter(item => item.status.toLowerCase() === statusFilter.toLowerCase());
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const handleDelete = (id: string) => {
    console.log('Delete item with ID:', id);
    if (onDelete) {
      onDelete(id);
    }
  };
  
  const handleView = (id: string) => {
    console.log('View item with ID:', id);
    if (onView) {
      onView(id);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>

      <Tabs defaultValue="todos" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="todos">To Dos</TabsTrigger>
          <TabsTrigger value="raisedByMe">Raised by Me</TabsTrigger>
        </TabsList>
        
        <TabsContent value="todos" className="mt-4">
          <TableContent 
            data={paginatedData}
            onDelete={handleDelete}
            onView={handleView}
          />
        </TabsContent>
        
        <TabsContent value="raisedByMe" className="mt-4">
          <TableContent 
            data={paginatedData}
            onDelete={handleDelete}
            onView={handleView}
          />
        </TabsContent>
      </Tabs>

      <TablePagination 
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
};
