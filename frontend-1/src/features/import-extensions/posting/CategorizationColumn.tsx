import { Tag, Tooltip } from "antd";
import { Sparkles } from "lucide-react";
import { ImportExtensionColumn, ImportExtensionState } from "../types";

/**
 * Get the AI Category column definition for posting imports
 *
 * This column displays AI-predicted categories for each transaction.
 * Extracted from CsvMapper to keep generic import components model-agnostic.
 */
export function getCategorizationColumn(state: ImportExtensionState): ImportExtensionColumn {
  return {
    title: (
      <div className="flex items-center gap-1">
        <Sparkles size={14} className="text-purple-500" />
        <span>AI Category</span>
      </div>
    ),
    key: 'ai_category',
    width: 180,
    fixed: 'right' as const,
    render: (_: any, __: any, index: number) => {
      const cat = state.categorizations[index];
      if (!cat) return <span className="text-gray-400">-</span>;

      const confidenceColor =
        cat.confidence === 'high' ? 'green' :
          cat.confidence === 'medium' ? 'gold' : 'red';

      return (
        <Tooltip title={cat.reasoning || 'No reasoning provided'}>
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm truncate max-w-[150px]">
              {cat.account_name || 'Unknown'}
            </span>
            <Tag color={confidenceColor} className="w-fit">
              {Math.round((cat.confidence_score || 0) * 100)}%
            </Tag>
          </div>
        </Tooltip>
      );
    },
  };
}
