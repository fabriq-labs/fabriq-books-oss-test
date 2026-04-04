
import React, { useState } from 'react';
import { User } from '@/models/User';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Users } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { ListCard } from '@/components/ui/list-card';
import { ActionButtons } from '@/components/ui/action-buttons';

interface UserWithDepartment extends User {
  department?: {
    dept_name: string;
  } | null;
}

interface UserListProps {
  users: UserWithDepartment[];
  onEdit: (user: UserWithDepartment) => void;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => void;
}

const UserList: React.FC<UserListProps> = ({
  users,
  onEdit,
  onDelete,
  onAdd,
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithDepartment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleDeleteClick = (user: UserWithDepartment) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (userToDelete) {
      await onDelete(userToDelete.id);
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.department?.dept_name && 
      user.department.dept_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addButton = (
    <Button onClick={onAdd} className="flex items-center gap-2 bg-primary hover:bg-primary/90 whitespace-nowrap">
      <Plus size={16} />
      <span className="hidden sm:inline">Add User</span>
      <span className="inline sm:hidden">Add</span>
    </Button>
  );

  return (
    <>
      <ListCard
        title="Users"
        icon={<Users className="text-primary" size={24} />}
        onSearch={setSearchTerm}
        searchValue={searchTerm}
        searchPlaceholder="Search users..."
        actionButton={addButton}
      >
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-semibold">User ID</TableHead>
              <TableHead className="font-semibold">Username</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Department</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4 text-gray-500">
                  {searchTerm ? 'No matching users found.' : 'No users found. Create one to get started.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{user.id.substring(0, 8)}...</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.department?.dept_name || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={user.status === 'Active' ? 'default' : 'secondary'}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ActionButtons
                      id={user.id}
                      onEdit={() => onEdit(user)}
                      onDelete={() => handleDeleteClick(user)}
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
              This action cannot be undone. This will permanently delete the user
              {userToDelete && <strong> "{userToDelete.username}"</strong>} and remove them
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

export default UserList;
