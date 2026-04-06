import React, { useState } from 'react';
import { PauseCircle, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClarificationRequest } from '@/contexts/AgentSessionContext';

interface ClarificationCardProps {
  clarification: ClarificationRequest;
  onSubmit: (answer: string) => Promise<void>;
}

export const ClarificationCard: React.FC<ClarificationCardProps> = ({ clarification, onSubmit }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extract options from input_schema (new format) or fall back to legacy context format
  const inputSchema = (clarification as any)?.input_schema;
  const schemaOptions = inputSchema?.options;
  const available = clarification.context?.available;
  const accountIds = clarification.context?.account_ids;

  const hasSchemaOptions = Array.isArray(schemaOptions) && schemaOptions.length > 0;
  const hasOptions = Array.isArray(available) && available.length > 0;
  const hasIdMapping = accountIds && typeof accountIds === 'object' && Object.keys(accountIds).length > 0;
  const showOptions = hasSchemaOptions || hasOptions || hasIdMapping;

  const handleChipClick = async (option: string) => {
    if (isSubmitting) return;
    setSelected(option);
    setIsSubmitting(true);
    try {
      await onSubmit(option);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextSubmit = async () => {
    const answer = freeText.trim();
    if (!answer || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(answer);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <PauseCircle className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-xs font-medium text-amber-700">Clarification needed</span>
      </div>

      <p className="text-sm text-gray-800 mb-3">{clarification.question}</p>

      {showOptions ? (
        <div className="flex flex-wrap gap-2">
          {hasSchemaOptions
            ? schemaOptions.map((option: any) => (
                <button
                  key={option.id}
                  onClick={() => handleChipClick(option.label)}
                  disabled={isSubmitting}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    selected === option.label
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100',
                    isSubmitting && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isSubmitting && selected === option.label ? (
                    <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                  ) : null}
                  {option.label}
                </button>
              ))
            : hasIdMapping
            ? Object.entries(accountIds).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => handleChipClick(name as string)}
                  disabled={isSubmitting}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    selected === (name as string)
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100',
                    isSubmitting && 'opacity-50 cursor-not-allowed'
                  )}
                  title={`ID: ${id}`}
                >
                  {isSubmitting && selected === (name as string) ? (
                    <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                  ) : null}
                  {name}
                </button>
              ))
            : available.map((option) => {
                const optionLabel = typeof option === 'string' ? option : option.label;
                const optionKey = typeof option === 'string' ? option : option.id;
                return (
                  <button
                    key={optionKey}
                    onClick={() => handleChipClick(optionLabel)}
                    disabled={isSubmitting}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm border transition-colors',
                      selected === optionLabel
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100',
                      isSubmitting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isSubmitting && selected === optionLabel ? (
                      <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                    ) : null}
                    {optionLabel}
                  </button>
                );
              })}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
            placeholder="Your answer…"
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
