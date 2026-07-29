/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Skeleton } from 'antd';
import { Button } from '@/components/ui/button';
import { Input, Select } from 'antd';
import dayjs from 'dayjs';
import { useRequisitionForm } from '../purchase-requisition/useRequisitionForm';
import WorkflowActions from '../purchase-requisition/WorkflowActions';
import { workflowAPI, viewAPI } from '@/api/api';
import { useToast } from '@/components/ui/use-toast';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { Attachment } from '@/components/attachment/Attachment';
import InvoiceLineItems from './InvoiceLineItems';
import { QuickSupplierCreateDialog } from '@/components/forms/shared/QuickPartyCreateDialog';
import {
  fetchEntityTaxPack,
  fetchPrimaryPartyTaxRegistration,
  fetchZeroRatedTaxGroup,
  type PartyTaxRegistration,
  type ZeroRatedTaxGroup,
} from '@/lib/tax/taxLookups';
import {
  isExportTaxTreatment,
  resolveTaxPack,
  suggestTaxGroupId,
  type TaxPackCatalog,
} from '@/lib/tax/taxPack';
import { fetchLatestExchangeRate } from '@/lib/currency/exchangeRateLookups';
import {
  BILL_INVOICE_TYPE,
  resolvePoModeFromInvoice,
  type BillPoMode,
} from '@/lib/bills/poMode';
import { useEntity } from '@/contexts/EntityContext';

interface BillsInvoiceFormProps {
  onComplete?: () => void;
  requisitionId?: string;
  readOnly?: boolean;
  onBack?: () => void;
}

const formatPaymentTerms = (paymentTerms: unknown): string | undefined => {
  if (!paymentTerms) return undefined;
  if (typeof paymentTerms === 'string') return paymentTerms;
  if (typeof paymentTerms === 'object' && paymentTerms !== null && 'payment_terms' in paymentTerms) {
    const label = (paymentTerms as { payment_terms?: string }).payment_terms;
    return label || undefined;
  }
  return undefined;
};

const BillsInvoiceForm: React.FC<BillsInvoiceFormProps> = ({
  onComplete,
  requisitionId,
  readOnly = false,
  onBack,
}) => {
  const {
    form,
    lineItems,
    setLineItems,
    editingRowId,
    setEditingRowId,
    currentLineItem,
    setCurrentLineItem,
    updateTotalAmount,
  } = useRequisitionForm(onComplete, requisitionId, readOnly);

  const [details, setDetails] = useState<any>({});
  const [whorFlow, setWhorFlow] = useState<any>(null);
  const [actionData, setActionData] = useState<any>([]);
  const [state, setState] = useState<string>('');
  const [view, setView] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [action, setAction] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitLoader, setSubmitLoader] = useState<boolean>(false);
  const [workflowContext, setWorkflowContext] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [taxPack, setTaxPack] = useState<TaxPackCatalog>(resolveTaxPack('GENERIC'));
  const [sellerRegistration, setSellerRegistration] = useState<PartyTaxRegistration | null>(null);
  const [buyerRegistration, setBuyerRegistration] = useState<PartyTaxRegistration | null>(null);
  const [zeroRatedTaxGroup, setZeroRatedTaxGroup] = useState<ZeroRatedTaxGroup | null>(null);
  const didUserEditExchangeRateRef = useRef(false);
  /** One-time empty→default LE fill; must not re-arm on clear (that snaps HQ back). */
  const didApplyDefaultLegalEntityRef = useRef(false);
  const { currentEntityId } = useEntity();
  const [supplierCreateOpen, setSupplierCreateOpen] = useState(false);

  const { stateId, viewId } = useParams<{ stateId: string; viewId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const redirectPath = location.pathname.includes('/sales/') ? 'sales/invoices' : 'purchases/bills';
  const isWithPo = resolvePoModeFromInvoice(details) === 'With PO';

  const showStructuredTax = taxPack.id !== 'GENERIC';

  const resolveSellerRegionId = useCallback((data: any) => {
    return (
      data?.seller_tax_region_id ||
      data?.seller_tax_region?.id ||
      data?.supplier?.default_tax_region_id ||
      data?.supplier?.default_tax_region?.id ||
      null
    );
  }, []);

  const resolveSupplierTaxTreatment = useCallback((data: any) => {
    return data?.supplier?.tax_treatment || null;
  }, []);

  const applyTaxContext = useCallback(async (data: any) => {
    const leId = data?.legal_entity_id || data?.legal_entity?.id;
    const pack = await fetchEntityTaxPack(leId);
    setTaxPack(resolveTaxPack(pack));
    setZeroRatedTaxGroup(await fetchZeroRatedTaxGroup(pack));

    const supplierId =
      data?.supplier_id ||
      data?.supplier?.id ||
      data?.purchase_order?.supplier_id ||
      data?.purchase_order?.supplier_details?.id;
    const [sellerReg, buyerReg] = await Promise.all([
      supplierId
        ? fetchPrimaryPartyTaxRegistration('supplier', supplierId)
        : Promise.resolve(null),
      leId ? fetchPrimaryPartyTaxRegistration('entity', leId) : Promise.resolve(null),
    ]);
    setSellerRegistration(sellerReg);
    setBuyerRegistration(buyerReg);
  }, []);

  /**
   * Purchase suggestion: seller = supplier region, place of supply = bill tax_region_id,
   * export/overseas supplier treatment → zero-rated group when available.
   */
  const suggestTaxGroupsForLines = useCallback(
    async (opts?: {
      sellerRegionId?: string | null;
      placeOfSupplyId?: string | null;
      taxTreatment?: string | null;
      zeroRated?: ZeroRatedTaxGroup | null;
      invoiceLines?: any[];
      packId?: string;
    }) => {
      if (!requisitionId || readOnly) return;
      const packId = opts?.packId || taxPack.id;
      if (packId === 'GENERIC') return;

      const sellerRegionId =
        opts?.sellerRegionId !== undefined
          ? opts.sellerRegionId
          : resolveSellerRegionId(details);
      const placeOfSupplyId =
        opts?.placeOfSupplyId !== undefined
          ? opts.placeOfSupplyId
          : details?.tax_region_id || null;
      const taxTreatment =
        opts?.taxTreatment !== undefined
          ? opts.taxTreatment
          : resolveSupplierTaxTreatment(details);
      const zeroRated = opts?.zeroRated !== undefined ? opts.zeroRated : zeroRatedTaxGroup;
      const lines = (opts?.invoiceLines || details?.invoice_line_item || []).filter(
        (li: any) => li?.id && (li?.item_master_id || li?.item_master?.id),
      );
      if (lines.length === 0) return;

      const suggestions: Array<{
        id: string;
        tax_group_id: string | null;
        tax_group_name: string | null;
      }> = [];

      await Promise.all(
        lines.map(async (li: any) => {
          try {
            const productId = String(li.item_master_id || li.item_master?.id);
            const res: any = await viewAPI.getById(
              'item_master',
              productId,
              'item_master_view',
            );
            const product = res?.data;
            if (!product) return;

            const suggestedTaxGroupId = suggestTaxGroupId({
              sellerRegionId,
              placeOfSupplyId,
              defaultTaxGroupId: product.tax_group_id || product.tax_group?.id,
              interstateTaxGroupId:
                product.tax_group_interstate_id || product.tax_group_interstate?.id,
              taxTreatment,
              zeroRatedTaxGroupId: zeroRated?.id,
            });

            const currentGroupId = li.tax_group_id || li.tax_group?.id || null;
            if (isExportTaxTreatment(taxTreatment)) {
              if (suggestedTaxGroupId === currentGroupId) return;
            } else if (!suggestedTaxGroupId || suggestedTaxGroupId === currentGroupId) {
              return;
            }

            const taxGroupName = !suggestedTaxGroupId
              ? null
              : suggestedTaxGroupId === zeroRated?.id
                ? zeroRated?.name || suggestedTaxGroupId
                : suggestedTaxGroupId ===
                    (product.tax_group_interstate_id || product.tax_group_interstate?.id)
                  ? product.tax_group_interstate?.name || suggestedTaxGroupId
                  : product.tax_group?.name || suggestedTaxGroupId;

            suggestions.push({
              id: li.id,
              tax_group_id: suggestedTaxGroupId,
              tax_group_name: taxGroupName,
            });
          } catch (err) {
            console.error('Failed to suggest purchase tax group for line', li?.id, err);
          }
        }),
      );

      if (suggestions.length === 0) return;

      for (const suggestion of suggestions) {
        try {
          const res: any = await viewAPI.updateChild(
            'invoice',
            requisitionId,
            'invoice_view',
            'invoice_line_item',
            suggestion.id,
            { tax_group_id: suggestion.tax_group_id },
          );
          if (res?.data) setDetails(res.data);
        } catch (err) {
          console.error('Failed to persist suggested tax group', suggestion.id, err);
        }
      }
    },
    [
      requisitionId,
      readOnly,
      taxPack.id,
      details,
      zeroRatedTaxGroup,
      resolveSellerRegionId,
      resolveSupplierTaxTreatment,
    ],
  );

  const applyLatestExchangeRate = useCallback(
    async (opts: {
      currencyId?: string | null;
      baseCurrencyId?: string | null;
      asOfDate?: string | Date | null;
      persist?: boolean;
    }) => {
      if (didUserEditExchangeRateRef.current) return;
      const { currencyId, baseCurrencyId, asOfDate, persist } = opts;
      if (!currencyId || !baseCurrencyId) return;
      const latest = await fetchLatestExchangeRate(currencyId, baseCurrencyId, asOfDate);
      const rate = latest?.rate ?? 1;
      setDetails((prev: any) => ({ ...prev, exchange_rate: rate }));
      if (persist && requisitionId) {
        try {
          const res: any = await viewAPI.update('invoice', requisitionId, 'invoice_view', {
            exchange_rate: rate,
          });
          if (res?.data) setDetails(res.data);
        } catch (err: any) {
          console.error('Error updating exchange rate:', err?.message);
        }
      }
    },
    [requisitionId],
  );

  useEffect(() => {
    if (requisitionId) {
      didApplyDefaultLegalEntityRef.current = false;
      setLoading(true);
      const applyResponse = async (res: any) => {
        let data = res?.data ?? {};
        // New bills default to Without PO (catalog lines; no PO mapping UI).
        const poMode = resolvePoModeFromInvoice(data);
        const needsClassFix =
          data?.invoice_type !== BILL_INVOICE_TYPE ||
          data?.po_mode !== poMode ||
          !data?.po_mode;
        if (needsClassFix && requisitionId && data?.invoice_type !== 'SALES') {
          try {
            const patched: any = await viewAPI.update(
              'invoice',
              requisitionId,
              'invoice_view',
              { invoice_type: BILL_INVOICE_TYPE, po_mode: poMode },
            );
            data = patched?.data ?? {
              ...data,
              invoice_type: BILL_INVOICE_TYPE,
              po_mode: poMode,
            };
          } catch {
            data = {
              ...data,
              invoice_type: BILL_INVOICE_TYPE,
              po_mode: poMode,
            };
          }
        }
        setDetails(data);
        setActionData(res?.workflow_context?.current_state_ref?.source_actions ?? []);
        setState(res?.data?.status ?? '');
        setView(res?.stateDetails?.meta_view?.view_name ?? '');
        setType(res?.workflow_context?.flow?.model_name ?? '');
        setWorkflowContext(res?.workflow_context ?? null);
        setWhorFlow(res?.workflow_context ?? null);
        await applyTaxContext(data);
      };

      const load = viewId
        ? viewAPI.getById('invoice', requisitionId, viewId)
        : workflowAPI.getById('invoice', requisitionId, stateId);

      load
        .then(applyResponse)
        .catch((err) => console.log(err))
        .finally(() => setLoading(false));
    }
  }, [requisitionId, stateId, viewId, applyTaxContext]);

  // If bill has no legal_entity_id, apply global entity selector once; else HQ.
  // Do not re-run after the user clears the field (clear must stick).
  useEffect(() => {
    if (!requisitionId || loading) return;
    if (didApplyDefaultLegalEntityRef.current) return;
    const existing = details?.legal_entity_id;
    if (existing !== null && existing !== undefined && String(existing).trim() !== '') {
      didApplyDefaultLegalEntityRef.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let entity: any = null;
        if (currentEntityId) {
          try {
            const byId: any = await viewAPI.getById('entity', currentEntityId, 'entity_view');
            entity = byId?.data ?? null;
          } catch {
            entity = null;
          }
        }
        if (!entity?.id) {
          const res: any = await viewAPI.search(
            'entity',
            'entity_view',
            1,
            1,
            '',
            { is_it_headquartres: { eq: 'Yes' } },
            {},
          );
          entity = Array.isArray(res?.data) ? res.data[0] : null;
        }
        if (cancelled) return;
        if (!entity?.id) {
          didApplyDefaultLegalEntityRef.current = true;
          return;
        }
        const patch: Record<string, unknown> = { legal_entity_id: entity.id };
        if (entity.default_tax_region_id && !details?.tax_region_id) {
          patch.tax_region_id = entity.default_tax_region_id;
        }
        if (entity.basecurrency_id && !details?.currency_id) {
          patch.currency_id = entity.basecurrency_id;
          patch.exchange_rate = 1;
        }
        const savedRes: any = await viewAPI.update(
          'invoice',
          requisitionId,
          'invoice_view',
          patch,
        );
        if (cancelled) return;
        didApplyDefaultLegalEntityRef.current = true;
        const saved = savedRes?.data;
        if (saved) {
          setDetails(saved);
          await applyTaxContext(saved);
        } else {
          setDetails((prev: any) => ({
            ...prev,
            ...patch,
            legal_entity: entity,
          }));
          await applyTaxContext({ ...details, ...patch, legal_entity: entity });
        }
      } catch (e) {
        console.error('Failed to persist default legal_entity_id on bill:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitionId, loading, details?.legal_entity_id, currentEntityId]);

  const handleSubmit = useCallback(
    async (payload: any) => {
      if (!requisitionId) return;
      // Only persist scalar/API fields — nested relation objects in local state
      // (supplier, currency, tax_region, purchase_order, …) force Prisma's
      // relation UpdateInput and then reject scalar FKs like supplier_id.
      const {
        supplier,
        currency,
        tax_region,
        seller_tax_region,
        purchase_order,
        legal_entity,
        customers,
        payment_terms,
        location,
        invoice_line_item,
        payment_receipt,
        workflow_context,
        ...apiPayload
      } = payload || {};
      const updatedDetails = {
        ...apiPayload,
        ...(apiPayload?.total_price != null || details?.total_price != null
          ? {
              total_price: parseFloat(
                String(apiPayload?.total_price ?? details?.total_price ?? 0),
              ),
            }
          : {}),
      };
      try {
        const res: any = await viewAPI.update(
          'invoice',
          requisitionId,
          'invoice_view',
          updatedDetails,
        );
        const next = res?.data ?? details;
        setDetails(next);
        return next;
      } catch (err: any) {
        console.error('Error updating invoice:', err?.message);
        return null;
      }
    },
    [requisitionId, details],
  );

  const handleInputChange = useCallback((key: string, e: any) => {
    const value = e?.target ? e.target.value : e;
    setDetails((prev: any) => ({ ...prev, [key]: value }));
  }, []);

  const handleFieldUpdate = useCallback(
    async (fieldName: string, valueOverride?: any) => {
      if (readOnly) return;
      const value = valueOverride !== undefined ? valueOverride : details[fieldName];
      await handleSubmit({ [fieldName]: value });
    },
    [readOnly, details, handleSubmit],
  );

  const handleSelectChange = useCallback(
    async (sourceKey: string, key: string, value: any) => {
      const newVal = value?.[key];
      const patch: any = { [sourceKey]: newVal };
      if (sourceKey === 'purchase_order_id' && value) {
        patch.purchase_order = value;
        const poSupplierId = value?.supplier_id || value?.supplier_details?.id;
        if (poSupplierId) {
          patch.supplier_id = poSupplierId;
          patch.supplier = value?.supplier_details || value?.supplier || { id: poSupplierId };
          patch.supplier_name =
            value?.supplier_details?.supplier_name || value?.supplier?.supplier_name || null;
        }
      }
      setDetails((prev: any) => ({ ...prev, ...patch }));
      const saved = await handleSubmit(patch);
      if (sourceKey === 'purchase_order_id' && saved) {
        await applyTaxContext(saved);
      }
    },
    [handleSubmit, applyTaxContext],
  );

  const handleSelectClear = useCallback(
    async (sourceKey: string) => {
      setDetails((prev: any) => ({ ...prev, [sourceKey]: null }));
      await handleSubmit({ [sourceKey]: null });
    },
    [handleSubmit],
  );

  const handlePoModeChange = useCallback(
    async (value: BillPoMode) => {
      setDetails((prev: any) => ({
        ...prev,
        invoice_type: BILL_INVOICE_TYPE,
        po_mode: value,
      }));
      await handleSubmit({ invoice_type: BILL_INVOICE_TYPE, po_mode: value });
    },
    [handleSubmit],
  );

  const handleLegalEntitySelect = useCallback(
    async (_sourceKey: string, key: string, value: any) => {
      const leId = value?.[key] || null;
      const patch: any = {
        legal_entity_id: leId,
        legal_entity: value?.item || (leId ? { id: leId } : null),
      };
      if (!details?.tax_region_id && value?.item?.default_tax_region_id) {
        patch.tax_region_id = value.item.default_tax_region_id;
        patch.tax_region = value.item.default_tax_region || null;
      }
      if (!details?.currency_id && value?.item?.basecurrency_id) {
        patch.currency_id = value.item.basecurrency_id;
        patch.currency = value.item.currency || null;
        patch.exchange_rate = 1;
      }
      didApplyDefaultLegalEntityRef.current = true;
      setDetails((prev: any) => ({ ...prev, ...patch }));
      const saved = await handleSubmit(patch);
      if (saved) await applyTaxContext(saved);
      else await applyTaxContext({ ...details, ...patch });
    },
    [handleSubmit, applyTaxContext, details],
  );

  const handleSupplierSelect = useCallback(
    async (_sourceKey: string, key: string, value: any) => {
      const supplierId = value?.[key] || null;
      const supplierName = value?.item?.supplier_name || value?.supplier_name || null;
      const preferredCurrencyId =
        value?.item?.preferred_currency_id || value?.item?.currency?.id || null;
      const defaultRegionId = value?.item?.default_tax_region_id || null;
      const taxTreatment = value?.item?.tax_treatment || null;
      const baseCurrencyId =
        details?.legal_entity?.basecurrency_id || details?.legal_entity?.currency?.id;

      const patch: any = {
        supplier_id: supplierId,
        supplier_name: supplierName,
        supplier:
          value?.item ||
          (supplierId
            ? {
                id: supplierId,
                supplier_name: supplierName,
                tax_treatment: taxTreatment,
                default_tax_region_id: defaultRegionId,
              }
            : null),
        // Seller region for purchase tax suggestion (supplier state/province).
        seller_tax_region_id: defaultRegionId,
        seller_tax_region: value?.item?.default_tax_region || null,
      };
      // Place of supply defaults from HQ LE on create — do not overwrite on supplier change.
      if (!details?.currency_id && preferredCurrencyId) {
        patch.currency_id = preferredCurrencyId;
        patch.currency = value?.item?.currency || null;
      }

      setDetails((prev: any) => ({ ...prev, ...patch }));
      const saved = await handleSubmit(patch);
      const next = saved || { ...details, ...patch };
      if (saved) await applyTaxContext(saved);

      if (preferredCurrencyId && baseCurrencyId && !details?.currency_id) {
        didUserEditExchangeRateRef.current = false;
        await applyLatestExchangeRate({
          currencyId: preferredCurrencyId,
          baseCurrencyId,
          asOfDate: details?.invoice_date,
          persist: true,
        });
      }

      if (supplierId) {
        const reg = await fetchPrimaryPartyTaxRegistration('supplier', supplierId);
        setSellerRegistration(reg);
      } else {
        setSellerRegistration(null);
      }

      await suggestTaxGroupsForLines({
        sellerRegionId: defaultRegionId,
        placeOfSupplyId: next?.tax_region_id || details?.tax_region_id || null,
        taxTreatment,
        invoiceLines: next?.invoice_line_item || details?.invoice_line_item,
      });
    },
    [
      handleSubmit,
      applyTaxContext,
      applyLatestExchangeRate,
      suggestTaxGroupsForLines,
      details,
    ],
  );

  const handleCurrencySelect = useCallback(
    async (_sourceKey: string, key: string, value: any) => {
      const currencyId = value?.[key] || null;
      didUserEditExchangeRateRef.current = false;
      setDetails((prev: any) => ({
        ...prev,
        currency_id: currencyId,
        currency: value?.item || null,
      }));
      await handleSubmit({ currency_id: currencyId });
      const baseCurrencyId =
        details?.legal_entity?.basecurrency_id || details?.legal_entity?.currency?.id;
      await applyLatestExchangeRate({
        currencyId,
        baseCurrencyId,
        asOfDate: details?.invoice_date,
        persist: true,
      });
    },
    [handleSubmit, applyLatestExchangeRate, details?.legal_entity, details?.invoice_date],
  );

  const handlePlaceOfSupplyChange = useCallback(
    async (_sourceKey: string, key: string, value: any) => {
      const regionId = value?.[key] || null;
      setDetails((prev: any) => ({
        ...prev,
        tax_region_id: regionId,
        tax_region: value?.item || null,
      }));
      const saved = await handleSubmit({ tax_region_id: regionId });
      const next = saved || { ...details, tax_region_id: regionId };
      await suggestTaxGroupsForLines({
        placeOfSupplyId: regionId,
        sellerRegionId: resolveSellerRegionId(next),
        taxTreatment: resolveSupplierTaxTreatment(next),
        invoiceLines: next?.invoice_line_item || details?.invoice_line_item,
      });
    },
    [
      handleSubmit,
      suggestTaxGroupsForLines,
      details,
      resolveSellerRegionId,
      resolveSupplierTaxTreatment,
    ],
  );

  const handleTaxResponsibilityChange = useCallback(
    async (value: string) => {
      setDetails((prev: any) => ({ ...prev, tax_responsibility: value || null }));
      await handleSubmit({ tax_responsibility: value || null });
    },
    [handleSubmit],
  );

  const handleTaxGroupSelect = useCallback(
    async (lineItemId: string, taxGroupId: string | null, taxGroup?: any) => {
      if (!requisitionId || readOnly) return;
      try {
        const res: any = await viewAPI.updateChild(
          'invoice',
          requisitionId,
          'invoice_view',
          'invoice_line_item',
          lineItemId,
          { tax_group_id: taxGroupId },
        );
        if (res?.data) setDetails(res.data);
        else {
          setDetails((prev: any) => ({
            ...prev,
            invoice_line_item: (prev.invoice_line_item || []).map((li: any) =>
              li.id === lineItemId
                ? {
                    ...li,
                    tax_group_id: taxGroupId,
                    tax_group: taxGroup || (taxGroupId ? { id: taxGroupId } : null),
                  }
                : li,
            ),
          }));
        }
      } catch (err) {
        console.error('Error updating tax group:', err);
      }
    },
    [requisitionId, readOnly],
  );

  const handleClassificationBlur = useCallback(
    async (lineItemId: string, code: string) => {
      if (!requisitionId || readOnly) return;
      try {
        const res: any = await viewAPI.updateChild(
          'invoice',
          requisitionId,
          'invoice_view',
          'invoice_line_item',
          lineItemId,
          { classification_code: code || null },
        );
        if (res?.data) setDetails(res.data);
      } catch (err) {
        console.error('Error updating classification:', err);
      }
    },
    [requisitionId, readOnly],
  );

  const validateInvoiceQuantities = useCallback(
    async (action: any, invoiceData: any): Promise<boolean> => {
      const isRejectAction = action?.name?.toLowerCase() === 'reject';
      const isDraftAction = action?.name?.toLowerCase() === 'draft';
      if (isRejectAction || isDraftAction) return true;

      const items = invoiceData?.invoice_line_item;
      if (!Array.isArray(items)) return true;

      const invalidItems: any[] = [];
      items.forEach((item: any) => {
        // Catalog / Without-PO lines (or With-PO lines not mapped to a PO item) skip PO qty checks
        if (!item?.purchase_order_line_item_id && !item?.purchase_order_line_item?.id) {
          return;
        }
        const poQuantity = item?.purchase_order_line_item?.quantity || 0;
        const alreadyInvoicedQty = item?.purchase_order_line_item?.invoice_qty || 0;
        const remainingQuantity = poQuantity - alreadyInvoicedQty;
        const invoiceQty = item?.invoice_qty || 0;
        if (invoiceQty > remainingQuantity) {
          invalidItems.push({
            itemName: item?.item_name || item?.item_master?.item_name || 'Unknown Item',
            invoiceQty,
            remainingQuantity,
          });
        }
      });

      if (invalidItems.length > 0 && action?.name?.toLowerCase() == 'draft') {
        const first = invalidItems[0];
        toast({
          title: 'Invoice Quantity Validation Failed',
          description: `Cannot submit invoice. ${invalidItems.length} item(s) have invoice quantities exceeding available. Example: "${first.itemName}" - Invoice Qty (${first.invoiceQty}) exceeds available (${first.remainingQuantity}).`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    },
    [toast],
  );

  const supplierDisplay =
    details?.supplier ||
    details?.purchase_order?.supplier_details ||
    (details?.supplier_id
      ? { id: details.supplier_id, supplier_name: details.supplier_name }
      : null);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton active paragraph={{ rows: 3 }} />
        <Skeleton active paragraph={{ rows: 4 }} />
        <Skeleton active paragraph={{ rows: 2 }} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-screen-xl mx-auto">
      {readOnly && (
        <div className="flex justify-between items-center px-2">
          <div className="bg-primary-50 text-primary-700 px-3 py-1.5 rounded-md font-medium text-sm">
            View Mode
          </div>
          <Button onClick={onBack} variant="outline" size="sm">
            Close
          </Button>
        </div>
      )}

      <div className="rounded-lg bg-white p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5">
                Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    PO Mode
                  </label>
                    <Select
                    style={{ width: '100%' }}
                    value={resolvePoModeFromInvoice(details)}
                    disabled={
                      readOnly ||
                      (resolvePoModeFromInvoice(details) === 'With PO' &&
                        (whorFlow?.current_state_ref?.name ?? '').toLowerCase() !== 'draft')
                    }
                    onChange={(value) => handlePoModeChange(value as BillPoMode)}
                    options={[
                      { value: 'Without PO', label: 'Without PO' },
                      { value: 'With PO', label: 'With PO' },
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Legal Entity
                  </label>
                  <SearchDropDown
                    instanceType="entity"
                    instanceSourceKey="legal_entity_id"
                    instanceKey="id"
                    instanceLabel="legal_name"
                    instanceValue={
                      details?.legal_entity ||
                      (details?.legal_entity_id
                        ? { id: details.legal_entity_id }
                        : undefined)
                    }
                    onSelectItem={handleLegalEntitySelect}
                    onClear={async () => {
                      // Keep default-apply armed-off so clearing does not snap back to HQ.
                      didApplyDefaultLegalEntityRef.current = true;
                      setDetails((prev: any) => ({
                        ...prev,
                        legal_entity_id: null,
                        legal_entity: null,
                      }));
                      setTaxPack(resolveTaxPack('GENERIC'));
                      setBuyerRegistration(null);
                      await handleSubmit({ legal_entity_id: null });
                    }}
                    searchParams="legal_name"
                    type="invoice"
                    isShowSearch
                    limit="50"
                    disabled={readOnly}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    PO Number
                  </label>
                  {resolvePoModeFromInvoice(details) === 'With PO' ? (
                    <SearchDropDown
                      instanceType="purchase_order"
                      instanceSourceKey="purchase_order_id"
                      instanceKey="id"
                      instanceLabel="po_number"
                      instanceValue={details?.purchase_order}
                      onSelectItem={handleSelectChange}
                      onClear={handleSelectClear}
                      searchParams="po_number"
                      type="invoice"
                      isShowSearch={true}
                      disabled={
                        readOnly ||
                        (!!details?.purchase_order &&
                          (whorFlow?.current_state_ref?.name ?? '').toLowerCase() !== 'draft')
                      }
                    />
                  ) : (
                    <Input disabled placeholder="Only available with PO" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Remit To
                  </label>
                  <Input
                    value={details?.remit_to}
                    onChange={(e) => handleInputChange('remit_to', e)}
                    onBlur={() => handleFieldUpdate('remit_to')}
                    disabled={readOnly}
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    AP Comments
                  </label>
                  <Input
                    value={details?.ap_comment}
                    onChange={(e) => handleInputChange('ap_comment', e)}
                    onBlur={() => handleFieldUpdate('ap_comment')}
                    disabled={readOnly}
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Currency
                  </label>
                  <SearchDropDown
                    instanceType="currency"
                    instanceSourceKey="currency_id"
                    instanceKey="id"
                    instanceLabel="code"
                    instanceValue={details?.currency}
                    onSelectItem={handleCurrencySelect}
                    onClear={() => handleSelectClear('currency_id')}
                    limit="20"
                    searchParams="code"
                    type="invoice"
                    disabled={readOnly}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Exchange Rate
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={
                      details?.exchange_rate == null ? '' : String(details.exchange_rate)
                    }
                    onChange={(e) => {
                      didUserEditExchangeRateRef.current = true;
                      handleInputChange('exchange_rate', e);
                    }}
                    onBlur={() => {
                      const n = Number(details?.exchange_rate);
                      const rate = Number.isFinite(n) && n > 0 ? n : 1;
                      setDetails((prev: any) => ({ ...prev, exchange_rate: rate }));
                      void handleFieldUpdate('exchange_rate', rate);
                    }}
                    disabled={readOnly}
                    className="text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Latest rate to LE base currency; editable.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5 mb-2">
                Attachments
              </h4>
              <Attachment model="invoice" id={requisitionId} disabled={readOnly} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5">
                Invoice details
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Invoice #
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {details?.invoice_number ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">PR #</p>
                  <p className="text-sm font-medium text-foreground">
                    {details?.purchase_order?.pr_number ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Date</p>
                  <p className="text-sm font-medium text-foreground">
                    {details?.invoice_date
                      ? dayjs(details.invoice_date).format('DD-MM-YYYY')
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Requester
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {details?.purchase_order?.create_user?.name ?? '—'}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5 mb-2">
                Supplier information
              </h4>
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Supplier
                  </label>
                  <SearchDropDown
                    instanceType="supplier"
                    instanceSourceKey="supplier_id"
                    instanceKey="id"
                    instanceLabel="supplier_name"
                    instanceValue={supplierDisplay || undefined}
                    onSelectItem={handleSupplierSelect}
                    createOptionLabel="+ Add new supplier"
                    onCreateNew={() => setSupplierCreateOpen(true)}
                    onClear={async () => {
                      setDetails((prev: any) => ({
                        ...prev,
                        supplier_id: null,
                        supplier_name: null,
                        supplier: null,
                      }));
                      setSellerRegistration(null);
                      await handleSubmit({
                        supplier_id: null,
                        supplier_name: null,
                      });
                    }}
                    searchParams="supplier_name"
                    type="invoice"
                    isShowSearch
                    disabled={readOnly}
                  />
                  <QuickSupplierCreateDialog
                    open={supplierCreateOpen}
                    onOpenChange={setSupplierCreateOpen}
                    onCreated={async (supplier) => {
                      await handleSupplierSelect('supplier_id', 'id', {
                        id: supplier.id,
                        supplier_name: supplier.supplier_name,
                        item: supplier,
                      });
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {(supplierDisplay?.legal_name ||
                    details?.purchase_order?.supplier_details?.legal_name) && (
                    <p>
                      {supplierDisplay?.legal_name ||
                        details?.purchase_order?.supplier_details?.legal_name}
                    </p>
                  )}
                  {(supplierDisplay?.primary_email ||
                    details?.purchase_order?.supplier_details?.primary_email) && (
                    <p>
                      {supplierDisplay?.primary_email ||
                        details?.purchase_order?.supplier_details?.primary_email}
                    </p>
                  )}
                  {(supplierDisplay?.primary_phone ||
                    details?.purchase_order?.supplier_details?.primary_phone) && (
                    <p>
                      {supplierDisplay?.primary_phone ||
                        details?.purchase_order?.supplier_details?.primary_phone}
                    </p>
                  )}
                </div>
                {(details?.shipping_terms || formatPaymentTerms(details?.payment_terms)) && (
                  <div className="pt-2 space-y-1">
                    {details?.shipping_terms && (
                      <>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Shipping terms
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {details.shipping_terms}
                        </p>
                      </>
                    )}
                    {formatPaymentTerms(details?.payment_terms) && (
                      <>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                          Payment terms
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {formatPaymentTerms(details?.payment_terms)}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {showStructuredTax && (
              <div>
                <h4 className="text-sm font-semibold text-primary border-b border-primary/20 pb-1.5 mb-2">
                  Tax
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {taxPack.regionLabel}
                    </label>
                    <SearchDropDown
                      instanceType="tax_region"
                      instanceSourceKey="tax_region_id"
                      instanceKey="id"
                      instanceLabel="name"
                      instanceValue={
                        details?.tax_region_id
                          ? details?.tax_region || {
                              id: details.tax_region_id,
                              name: details.tax_region_id,
                            }
                          : undefined
                      }
                      onSelectItem={handlePlaceOfSupplyChange}
                      onClear={() => handleSelectClear('tax_region_id')}
                      limit="20"
                      searchParams="name"
                      type="tax_region"
                      disabled={readOnly}
                      additionalFilters={
                        taxPack.id === 'IN'
                          ? { country_code: { eq: 'IN' } }
                          : taxPack.id === 'CA'
                            ? { country_code: { eq: 'CA' } }
                            : undefined
                      }
                    />
                  </div>
                  {taxPack.showTaxResponsibility && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Tax responsibility
                      </label>
                      <Select
                        style={{ width: '100%' }}
                        value={details?.tax_responsibility || undefined}
                        allowClear
                        disabled={readOnly}
                        onChange={handleTaxResponsibilityChange}
                        options={[
                          { value: 'supplier', label: 'Supplier' },
                          { value: 'recipient', label: 'Recipient (RCM)' },
                        ]}
                        placeholder="Select"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Seller {taxPack.registrationLabel}
                    </label>
                    <Input
                      readOnly
                      value={sellerRegistration?.registration_number || ''}
                      placeholder={`No ${taxPack.registrationLabel} on file`}
                      className="text-sm bg-muted/30"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Buyer {taxPack.registrationLabel}
                    </label>
                    <Input
                      readOnly
                      value={buyerRegistration?.registration_number || ''}
                      placeholder={`No ${taxPack.registrationLabel} on file`}
                      className="text-sm bg-muted/30"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <InvoiceLineItems
            lineItems={lineItems}
            setLineItems={setLineItems}
            editingRowId={editingRowId}
            setEditingRowId={setEditingRowId}
            currentLineItem={currentLineItem}
            setCurrentLineItem={setCurrentLineItem}
            updateTotalAmount={updateTotalAmount}
            budgetLevel={details?.budget_level}
            details={details}
            setDetails={setDetails}
            readOnly={readOnly}
            requisitionId={requisitionId}
            whorFlow={whorFlow}
            showStructuredTax={showStructuredTax}
            taxPack={taxPack}
            onTaxGroupSelect={handleTaxGroupSelect}
            onClassificationBlur={handleClassificationBlur}
            taxSuggestion={{
              enabled: showStructuredTax,
              sellerRegionId: resolveSellerRegionId(details),
              placeOfSupplyId: details?.tax_region_id || null,
              taxTreatment: resolveSupplierTaxTreatment(details),
              zeroRatedTaxGroupId: zeroRatedTaxGroup?.id || null,
              zeroRatedTaxGroupName: zeroRatedTaxGroup?.name || null,
            }}
            allowPoMapping={
              resolvePoModeFromInvoice(details) === 'With PO' &&
              !!(details?.purchase_order_id || details?.purchase_order?.id)
            }
          />
        </div>
      </div>

      <div className="px-2 pb-4">
        {isWithPo ? (
          <WorkflowActions
            actionData={actionData}
            setActionData={setActionData}
            data={details}
            setData={setDetails}
            setAction={setAction}
            setIsModalOpen={setIsModalOpen}
            type={type}
            state={state}
            view={view}
            id={requisitionId ?? ''}
            isSubmitLoader={isSubmitLoader}
            setSubmitLoader={setSubmitLoader}
            form={form}
            currentStep={0}
            stepsLength={1}
            reDirect={redirectPath}
            readOnly={readOnly}
            workflowContext={workflowContext}
            onBeforeAction={validateInvoiceQuantities}
          />
        ) : (
          // Without PO: field blur already persists via viewAPI; no workflow Submit.
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (onBack) onBack();
                else navigate(`/${redirectPath}`);
              }}
            >
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillsInvoiceForm;
