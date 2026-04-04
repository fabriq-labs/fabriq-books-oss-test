import React from 'react';

/**
 * Rows returned by a bulk action for in-place merge (instead of full list reload).
 * Each entry must have an `id` field to match against existing rows.
 */
export interface MergeRow {
  id: string;
  [key: string]: any;
}

/**
 * Configuration for a custom bulk action in the Master component
 */
export interface BulkAction {
  /** Unique identifier for the action */
  id: string;
  
  /** Display label for the button */
  label: string;
  
  /** Optional icon to display before the label */
  icon?: React.ReactNode;
  
  /** Button variant style */
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  
  /** 
   * Handler function called when action is clicked.
   * 
   * Return value:
   * - `void` or `undefined`: Master will refetch the full list (default behavior).
   * - `{ mergeRows: MergeRow[] }`: Master will merge these rows into the existing
   *   list by `id` and skip the full refetch. Only works when the action also sets
   *   `returnsMergeRows: true`.
   *
   * @param selectedRows - Array of selected row data
   * @param context - Context object with type and view information
   */
  onClick: (
    selectedRows: any[], 
    context: { type: string; view: string }
  ) => Promise<void | { mergeRows: MergeRow[] }>;
  
  /**
   * When true, the action's onClick may return `{ mergeRows }` and Master will
   * merge those rows in-place instead of refetching the full list.
   * Default: false (always refetch).
   */
  returnsMergeRows?: boolean;

  /** 
   * Optional function to determine if action should be visible
   * @param selectedRows - Array of selected row data
   * @returns true if action should be visible
   */
  isVisible?: (selectedRows: any[]) => boolean;
  
  /** 
   * Optional function to determine if action should be disabled
   * @param selectedRows - Array of selected row data
   * @returns true if action should be disabled
   */
  isDisabled?: (selectedRows: any[]) => boolean;
  
  /** 
   * Optional confirmation dialog configuration
   * If provided, a confirmation modal will be shown before executing the action
   * Content can be a string or a function that receives selectedRows
   */
  confirmation?: {
    title: string;
    content: string | ((selectedRows: any[]) => string);
    okText?: string;
    cancelText?: string;
  };
}
