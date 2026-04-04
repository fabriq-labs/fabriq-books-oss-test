
import React from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Plus } from 'lucide-react';
import { Location } from '@/models/Location';
import { ActionButtons } from '@/components/ui/action-buttons';
import { ListCard } from '@/components/ui/list-card';

interface LocationListProps {
  locations: Location[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  hideHeader?: boolean;
  searchTerm?: string;
  onSearch?: (term: string) => void;
}

const LocationList: React.FC<LocationListProps> = ({ 
  locations, 
  onEdit, 
  onDelete, 
  onAdd,
  hideHeader = false,
  searchTerm = '',
  onSearch
}) => {
  const addButton = (
    <Button onClick={onAdd} className="flex items-center gap-2 bg-primary hover:bg-primary/90 whitespace-nowrap">
      <Plus size={16} />
      <span className="hidden sm:inline">Add Location</span>
      <span className="inline sm:hidden">Add</span>
    </Button>
  );

  return (
    <ListCard
      title="Locations"
      icon={<MapPin className="text-primary" size={24} />}
      onSearch={onSearch}
      searchValue={searchTerm}
      searchPlaceholder="Search locations..."
      actionButton={!hideHeader ? addButton : undefined}
    >
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="font-semibold">Name</TableHead>
            <TableHead className="font-semibold">Address</TableHead>
            <TableHead className="font-semibold">City</TableHead>
            <TableHead className="font-semibold">State</TableHead>
            <TableHead className="font-semibold">Country</TableHead>
            <TableHead className="w-[100px] text-right font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-4">
                No locations found
              </TableCell>
            </TableRow>
          ) : (
            locations.map((location) => (
              <TableRow key={location.id} className="hover:bg-muted/30">
                <TableCell className="font-medium">{location.name}</TableCell>
                <TableCell>{location.address}</TableCell>
                <TableCell>{location.city}</TableCell>
                <TableCell>{location.state}</TableCell>
                <TableCell>{location.country}</TableCell>
                <TableCell>
                  <ActionButtons 
                    id={location.id} 
                    onEdit={onEdit} 
                    onDelete={onDelete} 
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ListCard>
  );
};

export default LocationList;
