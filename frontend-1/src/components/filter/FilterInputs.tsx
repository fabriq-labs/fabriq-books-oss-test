import type { FilterFieldEnhancement } from "@/types/customRowRenderer";
import { X } from "lucide-react";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { viewAPI } from "@/api/api";

/**
 * For select columns, the grid may search by one field (e.g. `code`) while
 * `filterProps.recordPath` (e.g. `account.name`) describes how filtering should match
 * the row display — use the last path segment for search + instanceLabel in the filter UI.
 */
function mergeSelectPropsForFilter(col: Record<string, any>) {
    const sp = col.tableProps?.selectProps;
    if (!sp) return undefined;
    const path: string | undefined = col.filterProps?.recordPath;
    if (!path) return sp;
    const field = path.split(".").pop();
    if (!field) return sp;
    return { ...sp, searchParams: field, instanceLabel: field };
}

interface FilterInputsProps {
    values: string[];
    onChange: (values: string[]) => void;
    col: Record<string, any>;
    className?: string;
    operator?: string;
    filterEnhancement?: FilterFieldEnhancement;
    /** Pre-populated id→label map owned by FilterModal */
    selectLabels?: Record<string, string>;
    /** Report a resolved label up to FilterModal */
    onLabelResolved?: (id: string, label: string) => void;
}

// ── Multi-select: trigger (chips + arrow) → dropdown (search + checkbox list) ──
function MultiSelectFilterInput({
    values,
    onChange,
    tableProps,
    filterEnhancement,
    selectLabels,
    onLabelResolved,
}: {
    values: string[];
    onChange: (values: string[]) => void;
    tableProps: any;
    filterEnhancement?: FilterFieldEnhancement;
    selectLabels: Record<string, string>;
    onLabelResolved: (id: string, label: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const sp = tableProps?.selectProps;
    const instanceType: string = sp?.instanceType ?? '';
    const instanceKey: string = sp?.instanceKey ?? 'id';
    const instanceLabel: string = sp?.instanceLabel ?? 'name';
    const limit: number = sp?.limit ?? 10;

    // Keep a stable ref so fetchResults never re-creates when the callback identity changes
    const onLabelResolvedRef = useRef(onLabelResolved);
    onLabelResolvedRef.current = onLabelResolved;

    const fetchResults = useCallback(async (q: string) => {
        if (!instanceType) return;
        setIsSearching(true);
        try {
            const filters: Record<string, any> = { ...(filterEnhancement?.additionalFilters ?? {}) };
            if (q && sp?.searchParams) filters[sp.searchParams] = { contains: q };
            const res = await viewAPI.search(
                instanceType, `${instanceType}_view`, 1, limit, q || undefined, filters, {}
            ) as any;
            const data: any[] = res?.data ?? [];
            setResults(data);
            // Report labels for fetched items using the ref so this callback stays stable
            data.forEach((item: any) => {
                onLabelResolvedRef.current(String(item[instanceKey]), String(item[instanceLabel] ?? item[instanceKey]));
            });
        } catch {
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [instanceType, sp?.searchParams, filterEnhancement?.additionalFilters, limit, instanceKey, instanceLabel]);

    // Debounce typed queries
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchResults(query), query ? 250 : 0);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, fetchResults]);

    // Close on outside click
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

    const toggle = (item: any) => {
        const id = String(item[instanceKey]);
        const label = String(item[instanceLabel] ?? id);
        onLabelResolved(id, label);
        if (values.includes(id)) {
            onChange(values.filter(v => v !== id));
        } else {
            onChange([...values, id]);
        }
    };

    const removeValue = (id: string) => onChange(values.filter(v => v !== id));

    return (
        <div ref={containerRef} className="relative w-full min-w-0" onClick={e => e.stopPropagation()}>
            {/* Trigger */}
            <div
                className={`flex flex-wrap gap-1 items-center min-h-[36px] rounded-md border bg-[#F5EDFB] px-2 py-1 pr-7 cursor-pointer relative ${isOpen ? 'border-[#7028a0] ring-1 ring-[#7028a0]' : 'border-[#E5DEFF]'}`}
                onClick={openDropdown}
            >
                {values.length === 0 && (
                    <span className="text-sm text-[#9ca3af] select-none">Select…</span>
                )}
                {values.map(id => (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E5DEFF] text-[#5b21b6] text-xs font-semibold max-w-[180px]">
                        <span className="truncate">
                            {selectLabels[id] ?? <span className="animate-pulse opacity-60">···</span>}
                        </span>
                        <button
                            type="button"
                            className="inline-flex items-center shrink-0 text-[#9b87f5] hover:text-[#5b21b6]"
                            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); removeValue(id); }}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                ))}
                {/* Down arrow */}
                <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#9ca3af]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </span>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-white border border-[#e2e8f0] rounded-md shadow-lg overflow-hidden">
                    {/* Search */}
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
                    {/* List */}
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
                            const checked = values.includes(id);
                            return (
                                <div
                                    key={id}
                                    className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${checked ? 'bg-[#F5EDFB] font-semibold text-[#5b21b6]' : 'text-[#374151] hover:bg-[#f5ebf9]'}`}
                                    onMouseDown={e => { e.preventDefault(); toggle(item); }}
                                >
                                    {/* Checkbox */}
                                    <span className={`shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${checked ? 'bg-[#7028a0] border-[#7028a0]' : 'bg-white border-[#d1d5db]'}`}>
                                        {checked && (
                                            <svg viewBox="0 0 10 10" width="9" height="9" fill="none">
                                                <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        )}
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

// ── Main FilterInputs ─────────────────────────────────────────────────────────
export function FilterInputs({
    values,
    onChange,
    col,
    operator,
    filterEnhancement,
    selectLabels = {},
    onLabelResolved,
}: FilterInputsProps) {
    const { tableProps } = col;
    const [draftValue, setDraftValue] = useState('');
    const isSelectField = tableProps?.columnType === 'select';
    const filterSelectProps = useMemo(
        () => (isSelectField ? mergeSelectPropsForFilter(col) ?? tableProps?.selectProps : undefined),
        [isSelectField, col, tableProps?.selectProps],
    );
    const tablePropsForFilter = useMemo(
        () => (isSelectField && filterSelectProps ? { ...tableProps, selectProps: filterSelectProps } : tableProps),
        [isSelectField, tableProps, filterSelectProps],
    );

    // Fetch labels for pre-existing IDs that aren't in the cache yet.
    // Reports each resolved label up to FilterModal via onLabelResolved.
    useEffect(() => {
        if (!isSelectField || !onLabelResolved) return;
        const instanceType = filterSelectProps?.instanceType;
        const instanceLabel = filterSelectProps?.instanceLabel;
        if (!instanceType || !instanceLabel) return;

        const missingIds = values.filter(v => !selectLabels[v]);
        if (missingIds.length === 0) return;

        let isMounted = true;
        const load = async () => {
            for (const id of missingIds) {
                if (!isMounted) break;
                try {
                    let label: string | undefined;
                    try {
                        const r = await viewAPI.getById(instanceType, id, 'default') as any;
                        label = r?.data?.[instanceLabel];
                    } catch {
                        const r = await viewAPI.search(
                            instanceType, `${instanceType}_view`, 1, 1, undefined, { id: { eq: id } }, {}
                        ) as any;
                        label = r?.data?.[0]?.[instanceLabel];
                    }
                    if (isMounted) onLabelResolved(id, label ? String(label) : id);
                } catch {
                    if (isMounted) onLabelResolved(id, id);
                }
            }
        };
        load();
        return () => { isMounted = false; };
    }, [isSelectField, filterSelectProps?.instanceType, filterSelectProps?.instanceLabel, values, selectLabels, onLabelResolved]);

    if (operator === 'is_null' || operator === 'is_not_null') return null;

    if (isSelectField) {
        return (
            <MultiSelectFilterInput
                values={values}
                onChange={onChange}
                tableProps={tablePropsForFilter}
                filterEnhancement={filterEnhancement}
                selectLabels={selectLabels}
                onLabelResolved={onLabelResolved ?? (() => {})}
            />
        );
    }

    // text / number — inline token input
    const commitDraft = () => {
        const normalized = draftValue.trim().replace(/,$/, '').trim();
        if (!normalized || values.includes(normalized)) { setDraftValue(''); return; }
        onChange([...values, normalized]);
        setDraftValue('');
    };

    return (
        <div
            className="flex flex-wrap gap-1 items-center min-h-[36px] rounded-md border border-[#E5DEFF] bg-[#F5EDFB] px-2 py-1 cursor-text w-full min-w-0 focus-within:border-[#7028a0] focus-within:ring-1 focus-within:ring-[#7028a0]"
            onClick={e => e.stopPropagation()}
        >
            {values.map(v => (
                <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E5DEFF] text-[#5b21b6] text-xs font-semibold max-w-[180px]">
                    <span className="truncate">{v}</span>
                    <button
                        type="button"
                        className="inline-flex items-center shrink-0 text-[#9b87f5] hover:text-[#5b21b6]"
                        onMouseDown={e => { e.preventDefault(); onChange(values.filter(x => x !== v)); }}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
            <input
                className="flex-1 min-w-[80px] h-6 border-none bg-transparent outline-none text-sm text-[#374151] placeholder:text-[#9ca3af]"
                placeholder={values.length === 0 ? 'Type value and press Enter' : ''}
                value={draftValue}
                onChange={e => setDraftValue(e.target.value)}
                onKeyDown={e => {
                    if (e.key !== 'Enter' && e.key !== ',') return;
                    e.preventDefault();
                    commitDraft();
                }}
                onBlur={commitDraft}
                onClick={e => e.stopPropagation()}
            />
        </div>
    );
}
