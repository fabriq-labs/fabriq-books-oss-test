import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface SearchBarProps {
    onSearch: (term: string) => void;
    searchableFields: { key: string; label: string }[];
    selectedField: string;
    onFieldChange: (field: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({
    onSearch,
    searchableFields,
    selectedField,
    onFieldChange
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(searchTerm);
    };

    return (
        <form onSubmit={handleSearch} className="flex space-x-2 items-center mb-4">
            <div className="flex-1">
                <Input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                />
            </div>

            {searchableFields.length > 0 && (
                <select
                    value={selectedField}
                    onChange={(e) => onFieldChange(e.target.value)}
                    className="px-3 py-2 border rounded-md"
                >
                    {searchableFields.map(field => (
                        <option key={field.key} value={field.key}>
                            {field.label}
                        </option>
                    ))}
                </select>
            )}

            <Button type="submit">
                <Search className="h-4 w-4 mr-2" />
                Search
            </Button>
        </form>
    );
};

export default SearchBar;
