import React, { useMemo, useState } from 'react';
import { PauseCircle, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ClarificationRequest, ClarificationOption } from '@/contexts/AgentSessionContext';

interface ClarificationCardProps {
  clarification: ClarificationRequest;
  onSubmit: (answer: string) => Promise<void>;
}

type NormalizedOption = {
  /** Value submitted to /clarify — prefer stable id when available */
  value: string;
  /** Primary label shown in the control */
  label: string;
  /** Optional secondary line (e.g. account id) */
  secondary?: string;
};

function normalizeOptions(clarification: ClarificationRequest): NormalizedOption[] {
  const inputSchema = clarification.input_schema;
  const schemaOptions = inputSchema?.options;
  const available = clarification.context?.available;
  const accountIds = clarification.context?.account_ids;

  if (Array.isArray(schemaOptions) && schemaOptions.length > 0) {
    return schemaOptions
      .filter((o): o is ClarificationOption => !!o?.id && !!o?.label)
      .map((o) => ({
        value: o.id,
        label: o.label,
        secondary: o.id !== o.label ? o.id : undefined,
      }));
  }

  if (accountIds && typeof accountIds === 'object' && Object.keys(accountIds).length > 0) {
    return Object.entries(accountIds).map(([id, name]) => ({
      value: id,
      label: String(name),
      secondary: id,
    }));
  }

  if (Array.isArray(available) && available.length > 0) {
    return available.map((option) => {
      if (typeof option === 'string') {
        return { value: option, label: option };
      }
      return {
        value: option.id,
        label: option.label,
        secondary: option.id !== option.label ? option.id : undefined,
      };
    });
  }

  return [];
}

/** Disambiguate duplicate labels by appending id in the dropdown text. */
function displayLabel(option: NormalizedOption, all: NormalizedOption[]): string {
  const dupes = all.filter((o) => o.label === option.label).length > 1;
  if (dupes && option.secondary) {
    return `${option.label} (${option.secondary})`;
  }
  if (option.secondary && !option.label.includes(option.secondary)) {
    return `${option.label}`;
  }
  return option.label;
}

export const ClarificationCard: React.FC<ClarificationCardProps> = ({ clarification, onSubmit }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const options = useMemo(() => normalizeOptions(clarification), [clarification]);
  const showOptions = options.length > 0;
  /** Dropdown for multi-choice (e.g. several Checking Accounts with ids). */
  const useDropdown = options.length >= 2;

  const submit = async (answer: string) => {
    if (!answer || isSubmitting) return;
    setSelected(answer);
    setIsSubmitting(true);
    try {
      await onSubmit(answer);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextSubmit = async () => {
    await submit(freeText.trim());
  };

  const selectedOption = options.find((o) => o.value === selected) ?? null;

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <PauseCircle className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-xs font-medium text-amber-700">Clarification needed</span>
      </div>

      <p className="text-sm text-gray-800 mb-3">{clarification.question}</p>

      {showOptions && useDropdown ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={selected ?? undefined}
            onValueChange={(value) => setSelected(value)}
            disabled={isSubmitting}
          >
            <SelectTrigger className="flex-1 bg-white border-amber-300 focus:ring-amber-400">
              <SelectValue placeholder="Select an option…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => {
                // Always surface id alongside the name when we have both (e.g. Checking Account · acco_…)
                const primary = displayLabel(option, options);
                const itemText =
                  option.secondary && !primary.includes(option.secondary)
                    ? `${primary} · ${option.secondary}`
                    : primary;
                return (
                  <SelectItem key={option.value} value={option.value} textValue={itemText}>
                    {itemText}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <button
            onClick={() => selected && submit(selected)}
            disabled={!selected || isSubmitting}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Continue
          </button>
          {selectedOption?.secondary ? (
            <p className="text-[11px] text-amber-800/70 font-mono sm:basis-full">
              Selected id: {selectedOption.secondary}
            </p>
          ) : null}
        </div>
      ) : showOptions ? (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => submit(option.value)}
              disabled={isSubmitting}
              title={option.secondary ? `ID: ${option.secondary}` : undefined}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm border transition-colors',
                selected === option.value
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100',
                isSubmitting && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isSubmitting && selected === option.value ? (
                <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
              ) : null}
              {displayLabel(option, options)}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type={clarification.input_schema?.type === 'number' ? 'number' : 'text'}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
            placeholder={clarification.input_schema?.type === 'number' ? 'Enter a number…' : 'Your answer…'}
            disabled={isSubmitting}
            className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
          />
          <button
            onClick={handleTextSubmit}
            disabled={!freeText.trim() || isSubmitting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Continue
          </button>
        </div>
      )}
    </div>
  );
};
