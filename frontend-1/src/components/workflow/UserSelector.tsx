import React, { useState, useEffect, useRef } from "react";
import { viewAPI } from "@/api/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserSelectorProps {
  value?: string;
  selectedUser?: User | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const UserSelector: React.FC<UserSelectorProps> = ({
  value,
  selectedUser,
  onChange,
  placeholder = "Select user...",
  className,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize users with the selected user if it exists
  useEffect(() => {
    if (selectedUser && !users.some(u => u.id === selectedUser.id)) {
      setUsers(prev => [selectedUser, ...prev]);
    }
  }, [selectedUser]);

  // Debounced API call when user types
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (isOpen) {
      if (searchInput.length === 0) {
        // Initial search when opened or cleared
        fetchUsers("");
      } else if (searchInput.length >= 4) {
        // Search only after 4 characters
        debounceTimerRef.current = setTimeout(() => {
          fetchUsers(searchInput);
        }, 300);
      }
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchInput, isOpen]);

  const fetchUsers = async (searchTerm: string) => {
    setIsLoading(true);
    try {
      const filters: any = {};
      if (searchTerm) {
        filters.name = { contains: searchTerm };
      }

      const response = await viewAPI.search(
        'user',
        'user_view',
        1,
        15, // Get slightly more results
        searchTerm,
        filters,
        {}
      );
      
      let usersData = response.data || response || [];
      
      // Ensure the currently selected user is always in the list
      if (selectedUser && !usersData.some((u: User) => u.id === selectedUser.id)) {
        usersData = [selectedUser, ...usersData];
      }
      
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    e.stopPropagation();
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setSearchInput("");
      // Focus search input after Select opens
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 150);
    }
  };

  // Filter existing users list client-side for immediate feedback
  const displayUsers = searchInput.length > 0 && searchInput.length < 4
    ? users.filter(u => 
        u.name.toLowerCase().includes(searchInput.toLowerCase()) || 
        u.email.toLowerCase().includes(searchInput.toLowerCase())
      )
    : users;

  return (
    <Select value={value} onValueChange={onChange} onOpenChange={handleOpenChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {/* Prevent Select from closing when clicking/interacting with Input */}
        <div 
          className="p-2 sticky top-0 bg-white z-10 border-b" 
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Input
            ref={searchInputRef}
            placeholder="Search users..."
            value={searchInput}
            onChange={handleSearch}
            className="w-full"
          />
        </div>
        {isLoading && searchInput.length >= 4 ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">Searching...</span>
          </div>
        ) : displayUsers.length === 0 ? (
          <div className="py-4 px-3 text-sm text-gray-500 text-center">
            {searchInput.length > 0 ? "No users found" : "No users available"}
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            {displayUsers.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{user.name}</span>
                  <span className="text-xs text-gray-500">{user.email}</span>
                </div>
              </SelectItem>
            ))}
          </div>
        )}
      </SelectContent>
    </Select>
  );
};

export default UserSelector;
