import { ReactNode } from 'react';

/**
 * State returned by extension's useExtensionState hook
 */
export interface ImportExtensionState {
  isActive: boolean;
  categorizations: Record<number, {
    account_id: string;
    account_name: string;
    confidence: 'high' | 'medium' | 'low';
    confidence_score: number;
    reasoning?: string;
  }>;
  isProcessing: boolean;
  error?: string;
}

/**
 * Actions returned by extension's useExtensionState hook
 */
export interface ImportExtensionActions {
  setCategorizations: (categorizations: Record<number, any>) => void;
  setProcessing: (processing: boolean) => void;
  setError: (error: string | undefined) => void;
  clearState: () => void;
}

/**
 * Column definition for extension-provided columns
 */
export interface ImportExtensionColumn {
  title: ReactNode;
  key: string;
  width?: number;
  fixed?: 'left' | 'right';
  render: (value: any, record: any, index: number) => ReactNode;
}

/**
 * Props passed to toolbar action renderers
 */
export interface ToolbarActionProps {
  modelType: string;
  csvData: any[];
  selectedValues: string[];
  lookUpData: any[];
  filedSets: any;
  relationId?: string;
  relationSelection?: any;
  onCategorizationsReceived: (categorizations: Record<number, any>) => void;
}

/**
 * Props passed to extension column renderers
 */
export interface ColumnRenderProps {
  index: number;
  state: ImportExtensionState;
}

/**
 * Result from PDF upload handler
 */
export interface PdfUploadResult {
  csvContent: string;
  categorizations?: Array<{
    transaction_index: number;
    predicted_account_id: string;
    predicted_account_name: string;
    confidence_score: number;
    reasoning: string;
  }>;
}

/**
 * Options for PDF upload
 */
export interface PdfUploadOptions {
  legalEntityId?: string;
  accountId?: string;
}

/**
 * Context for building PDF upload options
 */
export interface PdfUploadContext {
  modelType: string;
  relationField?: string;
  /** Field name used as the parentData key (e.g. "account_id") — NOT the ID value */
  relationFieldId?: string;
  /** The actual selected record ID value (e.g. "acco_org_indian_demo_1103") */
  relationId?: string;
  relationSelection?: any;
}

/**
 * Import Extension Interface
 *
 * Implementations provide model-specific import UI features without
 * polluting generic components (CsvMapper, ImportPannel).
 */
export interface ImportExtension {
  /**
   * Target model this extension applies to (e.g., 'posting', 'invoice')
   */
  readonly targetModel: string;

  /**
   * Check if extension should be active for given context
   */
  canActivate(modelType: string, csvData: any[], mappings: string[]): boolean;

  /**
   * Get custom columns to add to the import table
   * @param state - Current extension state
   */
  getColumns?(state: ImportExtensionState): ImportExtensionColumn[];

  /**
   * Render toolbar actions (buttons, etc.)
   */
  renderToolbarActions?(props: ToolbarActionProps): ReactNode;

  /**
   * Handle PDF upload with model-specific processing
   * @param file - PDF file to process
   * @param options - Model-specific options
   */
  handlePdfUpload?(file: File, options: PdfUploadOptions): Promise<PdfUploadResult>;

  /**
   * Build PDF upload options from current import context
   */
  getPdfUploadOptions?(context: PdfUploadContext): PdfUploadOptions;

  /**
   * Get data transformations for upload
   * Allows extension to modify data before sending to server
   */
  transformDataForUpload?(
    csvData: any[],
    selectedValues: string[],
    categorizations: Record<number, any>
  ): { csvData: any[]; selectedValues: string[] };
}
