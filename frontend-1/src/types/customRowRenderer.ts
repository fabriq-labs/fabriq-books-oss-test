import type React from 'react';

export interface CustomColumnDef {
  key: string;
  title: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  /** Actual record field to sort by. Omit to disable sorting for this column. */
  sortKey?: string;
}

export interface RowRenderContext {
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  /** Output of renderActions(record) — includes injectRowActions and default Edit/Delete */
  actions: React.ReactNode;
}

export interface CustomRowRenderer {
  /** Column header definitions — replaces metadata-generated headers */
  columns: CustomColumnDef[];
  /** Returns <td> elements to be placed inside <tr> — must align with columns */
  renderCells: (record: any, ctx: RowRenderContext) => React.ReactNode;
  /** Optional row-level className based on record data */
  rowClassName?: (record: any) => string | undefined;
}
