
import React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { User } from '@/models/User';
import { useFormContext } from 'react-hook-form';

interface UserSelectorProps {
  form: ReturnType<typeof useFormContext>;
  users: User[];
  selectedUsers: string[];
  toggleUser: (email: string) => void;
}

const UserSelector: React.FC<UserSelectorProps> = ({
  form,
  users,
  selectedUsers,
  toggleUser
}) => {
  const [open, setOpen] = React.useState(false);

  // Safety check to ensure users is always iterable
  const safeUsers = users || [];
  
  return (
    <FormField
      control={form.control}
      name="visible_to"
      render={() => (
        <FormItem>
          <FormLabel>Visible to Users</FormLabel>
          <FormControl>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between"
                >
                  {selectedUsers.length > 0
                    ? `${selectedUsers.length} user${selectedUsers.length !== 1 ? 's' : ''} selected`
                    : "Select users..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-full min-w-[220px]">
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandEmpty>No users found.</CommandEmpty>
                  <CommandGroup>
                    <CommandList>
                      {safeUsers.map((user) => (
                        <CommandItem
                          key={user.email}
                          value={user.email}
                          onSelect={() => {
                            toggleUser(user.email);
                          }}
                          className="flex items-center"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedUsers.includes(user.email) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span>{user.username || user.email}</span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </FormControl>
        </FormItem>
      )}
    />
  );
};

export default UserSelector;
