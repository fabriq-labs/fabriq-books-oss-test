import { X } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { viewAPI } from "@/api/api";
import { Input } from "@/components/ui/input";

interface EditValueInputProps {
    value: string;
    onChange: (value: string) => void;
    col: Record<string, any>;
    className?: string;
    /** Known label for the current value (avoids a fetch on first render) */
    label?: string;
    /** Extra filters merged into every search call (e.g. entity scoping). */
    additionalFilters?: Record<string, any>;
}

// ── Single-select combobox ────────────────────────────────────────────────────
function SelectCombobox({
    value,
    onChange,
    tableProps,
    initialLabel,
    className,
    additionalFilters,
}: {
    value: string;
    onChange: (value: string) => void;
    tableProps: any;
    initialLabel?: string;
    className?: string;
    additionalFilters?: Record<string, any>;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState(initialLabel ?? '');
    const searchRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const sp = tableProps?.selectProps;
    const instanceType: string = sp?.instanceType ?? '';
    const instanceKey: string = sp?.instanceKey ?? 'id';
    const instanceLabel: string = sp?.instanceLabel ?? 'name';
    const limit: number = sp?.limit ?? 10;

    // Resolve label for a pre-existing value that has no label yet
    useEffect(() => {
        if (!value || selectedLabel || !instanceType) return;
        let alive = true;
        const load = async () => {
            try {
                const r = await viewAPI.getById(instanceType, value, 'default') as any;
                const lbl = r?.data?.[instanceLabel];
                if (alive && lbl) setSelectedLabel(String(lbl));
            } catch {
                if (alive) setSelectedLabel(value);
            }
        };
        load();
        return () => { alive = false; };
    }, [value, selectedLabel, instanceType, instanceLabel]);

    const fetchResults = useCallback(async (q: string) => {
        if (!instanceType) return;
        setIsSearching(true);
        try {
            const filters: Record<string, any> = { ...(additionalFilters ?? {}) };
            if (q && sp?.searchParams) filters[sp.searchParams] = { contains: q };
            const res = await viewAPI.search(
                instanceType, `${instanceType}_view`, 1, limit, q || undefined, filters, {}
            ) as any;
            setResults(res?.data ?? []);
        } catch {
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [instanceType, sp?.searchParams, limit, additionalFilters]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchResults(query), query ? 250 : 0);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, fetchResults]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const openDropdown = () => {
        setIsOpen(true);
        fetchResults('');
        setTimeout(() => searchRef.current?.focus(), 0);
    };

    const select = (item: any) => {
        const id = String(item[instanceKey]);
        const lbl = String(item[instanceLabel] ?? id);
        onChange(id);
        setSelectedLabel(lbl);
        setIsOpen(false);
        setQuery('');
    };

    const clear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setSelectedLabel('');
    };
    return (
        <div ref={containerRef} className={`relative w-full min-w-0 ${className ?? ''}`} onClick={e => e.stopPropagation()}>
            {/* Trigger */}
            <div
                className={`flex items-center h-10 min-w-0 overflow-hidden rounded-md border bg-[#F5EDFB] px-3 pr-10 cursor-pointer relative ${isOpen ? 'border-[#7028a0] ring-1 ring-[#7028a0]' : 'border-[#E5DEFF]'}`}
                onClick={openDropdown}
            >
                {value && selectedLabel ? (
                    <span className="block text-sm text-[#374151] truncate flex-1 min-w-0" title={selectedLabel}>
                        {selectedLabel}
                    </span>
                ) : value && !selectedLabel ? (
                    <span className="block text-sm text-[#9ca3af] truncate flex-1 min-w-0 animate-pulse">···</span>
                ) : (
                    <span className="block text-sm text-[#9ca3af] select-none truncate flex-1 min-w-0">Select…</span>
                )}
                {value ? (
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-[#9ca3af] hover:text-[#5b21b6] bg-[#F5EDFB] rounded-sm"
                        onMouseDown={clear}
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                ) : (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#9ca3af]">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-white border border-[#e2e8f0] rounded-md shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-[#e2e8f0]">
                        <input
                            ref={searchRef}
                            className="w-full border border-[#e2e8f0] rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#7028a0] placeholder:text-[#9ca3af]"
                            placeholder="Search…"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                        />
                    </div>
                    <div className="max-h-[180px] overflow-y-auto py-1">
                        {isSearching && (
                            <div className="flex items-center justify-center py-3">
                                <div className="h-4 w-4 rounded-full border-2 border-[#7028a0] border-t-transparent animate-spin" />
                            </div>
                        )}
                        {!isSearching && results.length === 0 && (
                            <div className="px-3 py-2 text-xs text-[#9ca3af]">No results</div>
                        )}
                        {!isSearching && results.map(item => {
                            const id = String(item[instanceKey]);
                            const active = id === value;
                            return (
                                <div
                                    key={id}
                                    className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${active ? 'bg-[#F5EDFB] font-semibold text-[#5b21b6]' : 'text-[#374151] hover:bg-[#f5ebf9]'}`}
                                    onMouseDown={e => { e.preventDefault(); select(item); }}
                                >
                                    <span
                                        className={`shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center ${active ? 'border-[#7028a0]' : 'border-[#d1d5db]'}`}
                                    >
                                        {active && <span className="w-2 h-2 rounded-full bg-[#7028a0]" />}
                                    </span>
                                    <span className="truncate">{item[instanceLabel]}</span>
                                    {sp?.instanceSubLabel && item[sp.instanceSubLabel] && (
                                        <span className="ml-auto text-xs text-[#9ca3af] shrink-0">({item[sp.instanceSubLabel]})</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main EditValueInput ───────────────────────────────────────────────────────
export function EditValueInput({ value, onChange, col, className, label, additionalFilters }: EditValueInputProps) {
    const { tableProps } = col;
    const isSelectField = tableProps?.columnType === 'select';

    if (isSelectField) {
        return (
            <SelectCombobox
                value={value}
                onChange={onChange}
                tableProps={tableProps}
                initialLabel={label}
                className={className}
                additionalFilters={additionalFilters}
            />
        );
    }

    return (
        <Input
            className={`bg-[#F5EDFB] border-[#E5DEFF] focus:border-[#7028a0] focus:ring-1 focus:ring-[#7028a0] text-sm ${className ?? ''}`}
            placeholder="Value"
            value={value}
            onChange={e => onChange(e.target.value)}
            onClick={e => e.stopPropagation()}
        />
    );
}
