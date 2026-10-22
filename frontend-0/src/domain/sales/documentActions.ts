import { isExternalSource, isFabriqSource } from '@/utils/sourceSystem';

export type DocumentCapability = 'edit' | 'readonly';
export type DocumentStatus = 'new' | 'draft' | 'posted' | 'void' | string;

export type DocumentActionId =
  | 'close'
  | 'cancel'
  | 'save_draft'
  | 'post'
  | 'void'
  | 'record_payment'
  | 'apply_credit';

export type DocumentAction = {
  id: DocumentActionId;
  label: string;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost';
  primary?: boolean;
};

/** True when Books may edit the row (null / fabriq lineage). */
export function isEditableSource(sourceSystemId?: string | null): boolean {
  return isFabriqSource(sourceSystemId);
}

/**
 * Resolve footer CTAs from view capability + document status.
 * External lineage always forces readonly regardless of the view name.
 */
export function resolveDocumentActions(args: {
  capability: DocumentCapability;
  status?: DocumentStatus | null;
  sourceSystemId?: string | null;
  /** When true, include Record payment / Apply credit on posted edit invoices. */
  settlementActions?: boolean;
}): DocumentAction[] {
  const forcedReadonly =
    args.capability === 'readonly' || isExternalSource(args.sourceSystemId);
  if (forcedReadonly) {
    return [{ id: 'close', label: 'Close', variant: 'outline', primary: true }];
  }

  const status = !args.status || args.status === 'new' ? 'draft' : args.status;

  if (status === 'void') {
    return [{ id: 'close', label: 'Close', variant: 'outline', primary: true }];
  }

  if (status === 'posted') {
    const actions: DocumentAction[] = [
      { id: 'close', label: 'Close', variant: 'outline' },
    ];
    if (args.settlementActions !== false) {
      actions.push(
        { id: 'record_payment', label: 'Record payment', variant: 'default', primary: true },
        { id: 'apply_credit', label: 'Apply credit', variant: 'secondary' }
      );
    }
    actions.push({ id: 'void', label: 'Void', variant: 'destructive' });
    return actions;
  }

  // draft / new
  return [
    { id: 'cancel', label: 'Cancel', variant: 'ghost' },
    { id: 'save_draft', label: 'Save draft', variant: 'secondary' },
    { id: 'post', label: 'Post', variant: 'default', primary: true },
  ];
}

export function viewCapability(viewId?: string | null): DocumentCapability {
  if (!viewId) return 'edit';
  if (viewId.includes('_readonly_view') || viewId.endsWith('_readonly')) {
    return 'readonly';
  }
  return 'edit';
}
