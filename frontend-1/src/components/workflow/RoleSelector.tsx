import React, { useState, useEffect, useRef } from "react";
import { viewAPI } from "@/api/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface Role {
  id: string;
  name: string;
}

interface RoleSelectorProps {
  value?: string;
  selectedRole?: Role | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const RoleSelector: React.FC<RoleSelectorProps> = ({
  value,
  selectedRole,
  onChange,
  placeholder = "Select role...",
  className,
}) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize roles with the selected role if it exists
  useEffect(() => {
    if (selectedRole && !roles.some(r => r.id === selectedRole.id)) {
      setRoles(prev => [selectedRole, ...prev]);
    }
  }, [selectedRole]);

  // Debounced API call when user types
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (isOpen) {
      if (searchInput.length === 0) {
        // Initial search when opened or cleared
        fetchRoles("");
      } else if (searchInput.length >= 4) {
        // Search only after 4 characters
        debounceTimerRef.current = setTimeout(() => {
          fetchRoles(searchInput);
        }, 300);
      }
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchInput, isOpen]);

  const fetchRoles = async (searchTerm: string) => {
    setIsLoading(true);
    try {
      const filters: any = {};
      if (searchTerm) {
        filters.name = { contains: searchTerm };
      }

      const response = await viewAPI.search(
        'role',
        'role_view',
        1,
        15, // Get slightly more results
        searchTerm,
        filters,
        {}
      );
      
      let rolesData = response.data || response || [];
      
      // Ensure the currently selected role is always in the list
      if (selectedRole && !rolesData.some((r: Role) => r.id === selectedRole.id)) {
        rolesData = [selectedRole, ...rolesData];
      }
      
      setRoles(rolesData);
    } catch (error) {
      console.error("Error fetching roles:", error);
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

  // Filter existing roles list client-side for immediate feedback
  const displayRoles = searchInput.length > 0 && searchInput.length < 4
    ? roles.filter(r => r.name.toLowerCase().includes(searchInput.toLowerCase()))
    : roles;

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
            placeholder="Search roles..."
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
        ) : displayRoles.length === 0 ? (
          <div className="py-4 px-3 text-sm text-gray-500 text-center">
            {searchInput.length > 0 ? "No roles found" : "No roles available"}
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            {displayRoles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </div>
        )}
      </SelectContent>
    </Select>
  );
};

export default RoleSelector;
