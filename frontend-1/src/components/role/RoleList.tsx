
import React, { useState } from 'react';
import { Role } from '@/models/Role';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Plus } from 'lucide-react';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ActionButtons } from '@/components/ui/action-buttons';
import { ListCard } from '@/components/ui/list-card';

interface RoleWithUser extends Role {
  user?: {
    username: string;
  }
}

interface RoleListProps {
  roles: RoleWithUser[];
  onEdit: (role: RoleWithUser) => void;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => void;
}

const RoleList: React.FC<RoleListProps> = ({
  roles,
  onEdit,
  onDelete,
  onAdd,
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleWithUser | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleDeleteClick = (role: RoleWithUser) => {
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (roleToDelete) {
      await onDelete(roleToDelete.id);
      setDeleteDialogOpen(false);
      setRoleToDelete(null);
    }
  };

  const filteredRoles = roles.filter(role => 
    !searchTerm || 
    role.role_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    role.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (role.user?.username && role.user.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addButton = (
    <Button onClick={onAdd} className="flex items-center gap-2 bg-primary hover:bg-primary/90 whitespace-nowrap">
      <Plus size={16} />
      <span className="hidden sm:inline">Add Role</span>
      <span className="inline sm:hidden">Add</span>
    </Button>
  );

  return (
    <>
      <ListCard
        title="Roles"
        icon={<Users className="text-primary" size={24} />}
        onSearch={setSearchTerm}
        searchValue={searchTerm}
        searchPlaceholder="Search roles..."
        actionButton={addButton}
      >
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-semibold">Role ID</TableHead>
              <TableHead className="font-semibold">User</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Role Name</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRoles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4 text-gray-500">
                  {searchTerm ? 'No matching roles found.' : 'No roles found. Create one to get started.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredRoles.map((role) => (
                <TableRow key={role.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{role.id.substring(0, 8)}...</TableCell>
                  <TableCell>{role.user?.username || '-'}</TableCell>
                  <TableCell>{role.email}</TableCell>
                  <TableCell>{role.role_name}</TableCell>
                  <TableCell>
                    <ActionButtons
                      id={role.id}
                      onEdit={() => onEdit(role)}
                      onDelete={() => handleDeleteClick(role)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListCard>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the role
              {roleToDelete && <strong> "{roleToDelete.role_name}"</strong>} for user
              {roleToDelete?.user && <strong> "{roleToDelete.user.username}"</strong>} and remove it
              from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RoleList;
