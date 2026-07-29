import React, { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { DatePicker } from "antd";
import { FileText, Plus } from "lucide-react";
import { SearchDropDown } from "./search_dropdown/dropdown";
import { constructObject } from "./utils/helper";
import { pdf } from "@react-pdf/renderer";
import { InvoicePDFDocument } from "./pdf_generator/InvoicePdf";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { viewAPI } from "@/api/api";
import dayjs from "dayjs";
import { PdfViewerModal } from "./ui/pdf-viewer-modal";
import { PaymentReceiptModal } from "./forms/Masters/PaymentReceiptModal";
import { PaymentReceiptTable } from "./forms/Masters/PaymentReceiptTable";
import { SalesInvoiceItemTable } from "./forms/Masters/SalesInvoiceItemTable";
import { Attachment } from "./attachment/Attachment";
import { QuickCustomerCreateDialog } from "./forms/shared/QuickPartyCreateDialog";
import { formatCurrency } from "@/lib/formatters";
import { currencyUtils } from "@/utils/currencyUtils";
import {
  isExportTaxTreatment,
  resolveTaxPack,
  suggestTaxGroupId,
} from "@/lib/tax/taxPack";
import {
  fetchEntityTaxPack,
  fetchPrimaryPartyTaxRegistration,
  fetchZeroRatedTaxGroup,
  PartyTaxRegistration,
  ZeroRatedTaxGroup,
} from "@/lib/tax/taxLookups";
import { fetchLatestExchangeRate } from "@/lib/currency/exchangeRateLookups";

interface InvoiceItem {
  id: number | string;
  product: string;
  period: string;
  quantity: number | string;
  price: number | string;
  discount_rate?: number | string;
  discount_amount?: number;
  tax: number | string;
  total: number;
  item_name: string;
  item_description: string;
  item_number?: string;
  tax_group_id?: string | null;
  tax_group_name?: string | null;
  classification_code?: string | null;
  classification_scheme?: string | null;
  tax_components?: Array<{
    rate: number;
    amount: number;
    component_type?: string | null;
    tax_name?: string | null;
  }>;
}

const formatLocationAddress = (location?: {
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
} | null): string => {
  if (!location) return "";
  return `${location.address || ""}\n${location.city || ""}, ${location.state || ""} ${location.zip_code || ""}\n${location.country || ""}`.trim();
};

/** UI-only due date: invoice date + payment term days. */
const computeDueDate = (
  invoiceDate?: string | null,
  noOfDays?: number | string | null,
): string | null => {
  if (!invoiceDate || noOfDays == null || noOfDays === "") return null;
  const days = Number(noOfDays);
  if (!Number.isFinite(days)) return null;
  return dayjs(invoiceDate).add(days, "day").format("DD-MM-YYYY");
};

interface InvoiceFormData {
  legal_entity_id: string;
  legalEntityData: any;
  customer_id?: string;
  customerData: any;
  location_id: string | null;
  locationData: any;
  bill_to?: string;
  payment_terms_id?: string;
  paymentTermsData?: any;
  paymentTermsDays?: number | null;
  invoice_number: string;
  invoice_date: any;
  items: InvoiceItem[];
  subTotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  adjustable_label?: string;
  adjustable_value?: number | string;
  invoice_total: number;
  notes?: string;
  terms_and_conditions?: string;
  tax_region_id?: string | null;
  taxRegionData?: any;
  seller_tax_region_id?: string | null;
  tax_responsibility?: string | null;
  sellerRegistration?: PartyTaxRegistration | null;
  buyerRegistration?: PartyTaxRegistration | null;
  taxCountryPack?: string;
  /** Pack zero-rated / export group (e.g. GST0) for suggestion */
  zeroRatedTaxGroup?: ZeroRatedTaxGroup | null;
  currency_id?: string | null;
  currencyData?: any;
  /** Snapshot rate: invoice currency → LE base currency */
  exchange_rate?: number | string | null;
  /** LE functional currency id (rate denominator) */
  baseCurrencyId?: string | null;
}

export const InvoiceForm: React.FC = () => {
  const { id, viewId } = useParams<{ id: string; viewId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<any>({});
  const [legalEntity, setLegalEntity] = useState<any>({});
  const [customer, setCustomer] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locations, setLocations] = useState<any>({});
  const [formData, setFormData] = useState<InvoiceFormData>({
    legal_entity_id: "",
    legalEntityData: null,
    customerData: null,
    location_id: null,
    locationData: null,
    bill_to: "",
    payment_terms_id: "",
    paymentTermsData: null,
    paymentTermsDays: null,
    invoice_number: id,
    invoice_date: id ? null : new Date().toISOString(),
    invoice_total: null,
    items: [],
    subTotal: 0,
    totalDiscount: 0,
    totalTax: 0,
    grandTotal: 0,
    adjustable_label: "Adjustable",
    adjustable_value: 0,
    notes: "",
    terms_and_conditions: "",
    tax_region_id: null,
    taxRegionData: null,
    seller_tax_region_id: null,
    tax_responsibility: null,
    sellerRegistration: null,
    buyerRegistration: null,
    taxCountryPack: "GENERIC",
    zeroRatedTaxGroup: null,
    currency_id: null,
    currencyData: null,
    exchange_rate: 1,
    baseCurrencyId: null,
  });

  const [nextItemId, setNextItemId] = useState(1);
  const [initialValues, setInitialValues] = useState<any>(null);
  const didPersistHQLegalEntityRef = useRef(false);
  const [invoiceCurrencyCode, setInvoiceCurrencyCode] = useState<string>("INR");
  const didUserChangeLegalEntityRef = useRef(false);
  /** When true, auto rate lookup will not overwrite the exchange rate field. */
  const didUserEditExchangeRateRef = useRef(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState<string>("");
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const lastUpdateRef = useRef<{ field: string; timestamp: number } | null>(
    null,
  );
  const invoiceDateRef = useRef<string | null>(null);
  const [showPaymentReceiptModal, setShowPaymentReceiptModal] =
    useState(false);
  const [updatingPaymentReceiptId, setUpdatingPaymentReceiptId] = useState<
    string | null
  >(null);
  // Initialize form with react-hook-form
  const form = useForm({
    defaultValues: {
      legal_entity_id: "",
      // location: '',
      invoice_number: id,
      invoice_date: id ? null : new Date().toISOString(),
    },
  });

  // Calculate totals whenever items change
  useEffect(() => {
    const subTotal = formData.items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      return sum + quantity * price;
    }, 0);

    const totalDiscount = formData.items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const discountRate = Number(item.discount_rate) || 0;
      const itemSubtotal = quantity * price;
      return sum + (itemSubtotal * discountRate) / 100;
    }, 0);

    const totalTax = formData.items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const discountRate = Number(item.discount_rate) || 0;
      const tax = Number(item.tax) || 0;
      const itemSubtotal = quantity * price;
      const lineAfterDiscount = itemSubtotal - (itemSubtotal * discountRate) / 100;
      return sum + (lineAfterDiscount * tax) / 100;
    }, 0);

    const adjustableValue = Number(formData.adjustable_value) || 0;
    const grandTotal = subTotal - totalDiscount + totalTax + adjustableValue;

    setFormData((prev) => ({
      ...prev,
      subTotal,
      totalDiscount,
      totalTax,
      grandTotal,
    }));
  }, [formData.items, formData.adjustable_value]);
  useEffect(() => {
    if (id) {
      // Clear fields immediately to avoid showing stale values
      // from a previously opened invoice while the API request is in-flight.
      setFormData((prev) => ({
        ...prev,
        invoice_number: "",
        invoice_date: null,
      }));
      fetchDetails(id);
    }
  }, [id]);

  const fetchDetails = async (invoiceId: any) => {
    const res: any = await viewAPI.getById("invoice", invoiceId, "invoice_view");
      setInitialValues(res.data);
      // Map invoice line items to form items format, sorted by item_number when present
      const lineItems = res.data?.invoice_line_item || [];
      const mappedItems = mapLineItemsToForm(lineItems);
      // Only show items that exist – no empty items; add via "Add Item" button
      const items = mappedItems;
      invoiceDateRef.current = res.data.invoice_date || null;
      // Populate legalEntityData, customerData, locationData from API for review display
      const legalEntityData = res.data.legal_entity
        ? {
          item: res.data.legal_entity,
          legal_name:
            res.data.legal_entity.legal_name ||
            res.data.legal_entity.legal_name,
        }
        : null;
      const customerData = res.data.customers
        ? {
          item: res.data.customers,
          customer_name: res.data.customers.customer_name,
        }
        : null;
      if (customerData) {
        setCustomer(customerData);
      }
      const locationData = res.data.location
        ? {
          item: res.data.location,
          location:
            res.data.location.location ||
            res.data.location.address ||
            res.data.location.city,
        }
        : null;
      if (locationData) {
        setLocations(locationData);
      }
      const billTo =
        res.data.bill_to || formatLocationAddress(res.data.location) || "";

      const sellerRegionId =
        res.data.seller_tax_region_id ||
        res.data.legal_entity?.default_tax_region_id ||
        null;
      const placeOfSupplyId =
        res.data.tax_region_id ||
        res.data.customers?.default_tax_region_id ||
        null;
      const taxRegion =
        res.data.tax_region ||
        res.data.customers?.default_tax_region ||
        (placeOfSupplyId ? { id: placeOfSupplyId } : null);

      const [sellerRegistration, buyerRegistration, taxCountryPack, paymentTermsDays] =
        await Promise.all([
          res.data.legal_entity_id
            ? fetchPrimaryPartyTaxRegistration("entity", res.data.legal_entity_id)
            : Promise.resolve(null),
          res.data.customer_id
            ? fetchPrimaryPartyTaxRegistration("customer", res.data.customer_id)
            : Promise.resolve(null),
          fetchEntityTaxPack(res.data.legal_entity_id),
          (async () => {
            const nestedDays = res.data.payment_terms?.no_of_days;
            if (nestedDays != null) return Number(nestedDays);
            if (!res.data.payment_terms_id) return null;
            try {
              const pt: any = await viewAPI.getById(
                "payment_terms",
                res.data.payment_terms_id,
                "payment_terms_view",
              );
              return pt?.data?.no_of_days != null
                ? Number(pt.data.no_of_days)
                : null;
            } catch {
              return null;
            }
          })(),
        ]);
      const zeroRatedTaxGroup = await fetchZeroRatedTaxGroup(taxCountryPack);
      const customerTreatment =
        customerData?.item?.tax_treatment ||
        res.data.customers?.tax_treatment ||
        null;
      const effectivePlaceOfSupplyId = isExportTaxTreatment(customerTreatment)
        ? res.data.tax_region_id || null
        : placeOfSupplyId;
      const effectiveTaxRegion = isExportTaxTreatment(customerTreatment)
        ? res.data.tax_region ||
          (effectivePlaceOfSupplyId ? { id: effectivePlaceOfSupplyId } : null)
        : taxRegion;

      setFormData((prev) => ({
        ...prev,
        legal_entity_id: res.data.legal_entity_id,
        customer_id: res.data.customer_id,
        location_id: res.data.location_id,
        legalEntityData: legalEntityData || prev.legalEntityData,
        customerData: customerData || prev.customerData,
        locationData: locationData || prev.locationData,
        bill_to: billTo || prev.bill_to,
        payment_terms_id: res.data.payment_terms_id || prev.payment_terms_id,
        paymentTermsData: res.data.payment_terms
          ? { item: res.data.payment_terms, id: res.data.payment_terms_id }
          : prev.paymentTermsData,
        paymentTermsDays,
        invoice_number: res.data.invoice_number || prev.invoice_number,
        invoice_date: res.data.invoice_date || prev.invoice_date,
        grandTotal: res.data.invoice_total,
        adjustable_label:
          res.data.adjustable_label ??
          prev.adjustable_label ??
          "Adjustable",
        adjustable_value:
          Number(res.data.adjustable_value ?? prev.adjustable_value ?? 0),
        items: items,
        notes: res.data.notes ?? prev.notes ?? "",
        terms_and_conditions: res.data.terms_and_conditions ?? prev.terms_and_conditions ?? "",
        tax_region_id: effectivePlaceOfSupplyId,
        taxRegionData: effectiveTaxRegion
          ? {
              item: effectiveTaxRegion,
              id: effectivePlaceOfSupplyId,
              name: effectiveTaxRegion.name,
            }
          : null,
        seller_tax_region_id: sellerRegionId,
        tax_responsibility: res.data.tax_responsibility || null,
        sellerRegistration,
        buyerRegistration,
        taxCountryPack,
        zeroRatedTaxGroup,
        currency_id: res.data.currency_id || null,
        currencyData: res.data.currency
          ? { item: res.data.currency, id: res.data.currency_id }
          : null,
        exchange_rate:
          res.data.exchange_rate != null ? Number(res.data.exchange_rate) : 1,
        baseCurrencyId:
          res.data.legal_entity?.basecurrency_id ||
          res.data.legal_entity?.currency?.id ||
          null,
      }));

      if (res.data.currency?.code) {
        setInvoiceCurrencyCode(res.data.currency.code);
      }
      didUserEditExchangeRateRef.current = false;

      // Update nextItemId to avoid conflicts
      const maxId = Math.max(
        ...items.map((item: InvoiceItem) =>
          typeof item.id === "number" ? item.id : 0,
        ),
        0,
      );
      setNextItemId(maxId + 1);
  };

  const handleInputChange = (field: keyof InvoiceFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Update basic info via API on blur/change (when editing existing invoice)
  const handleFieldUpdate = useCallback(
    (field: string, overrideValue?: any) => {
      if (!id) return;
      const currentValue =
        overrideValue !== undefined
          ? overrideValue
          : formData[field as keyof InvoiceFormData];

      const now = Date.now();
      if (
        lastUpdateRef.current?.field === field &&
        now - lastUpdateRef.current.timestamp < 500
      ) {
        return;
      }
      lastUpdateRef.current = { field, timestamp: now };

      viewAPI
        .update("invoice", id, "invoice_view", { [field]: currentValue })
        .then((res: any) => {
          if (res?.data) {
            setInitialValues(res.data);
            setFormData((prev) => ({
              ...prev,
              ...(res.data?.legal_entity_id !== undefined && {
                legal_entity_id: res.data.legal_entity_id,
              }),
              ...(res.data?.invoice_number !== undefined && {
                invoice_number: res.data.invoice_number,
              }),
              ...(res.data?.invoice_date !== undefined && {
                invoice_date: res.data.invoice_date,
              }),
              ...(res.data?.invoice_total !== undefined && {
                grandTotal: res.data.invoice_total,
              }),
            }));
          }
        })
        .catch((err) => {
          console.error(`Error updating ${field}:`, err.message);
          toast({
            variant: "destructive",
            title: "Error",
            description: `Failed to update ${field.replace(/_/g, " ")}`,
          });
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  const resolveBaseCurrencyId = (le?: any): string | null =>
    le?.basecurrency_id ||
    le?.currency?.id ||
    le?.item?.basecurrency_id ||
    le?.item?.currency?.id ||
    null;

  /**
   * Look up latest exchange rate (invoice currency → LE base) and apply it
   * unless the user has manually edited the rate (and forceRefresh is false).
   */
  const applyLatestExchangeRate = async (args: {
    currencyId?: string | null;
    baseCurrencyId?: string | null;
    invoiceDate?: any;
    forceRefresh?: boolean;
    persist?: boolean;
  }) => {
    const currencyId = args.currencyId ?? null;
    const baseCurrencyId = args.baseCurrencyId ?? null;
    if (!currencyId) return;

    if (!args.forceRefresh && didUserEditExchangeRateRef.current) {
      return;
    }

    const latest = await fetchLatestExchangeRate(
      currencyId,
      baseCurrencyId || currencyId,
      args.invoiceDate,
    );
    const rate = latest?.rate != null && Number.isFinite(latest.rate) ? latest.rate : 1;
    didUserEditExchangeRateRef.current = false;
    setFormData((prev) => ({ ...prev, exchange_rate: rate }));
    if (args.persist && id) {
      handleFieldUpdate("exchange_rate", rate);
    }
  };

  const handleCurrencySelectChange = async (
    sourceKey: any,
    key: string,
    value: any,
  ) => {
    const currencyId = value?.[key] || value?.item?.id || null;
    const code = value?.item?.code;
    if (typeof code === "string" && code) {
      setInvoiceCurrencyCode(code);
    }

    const baseCurrencyId =
      formData.baseCurrencyId ||
      resolveBaseCurrencyId(formData.legalEntityData) ||
      resolveBaseCurrencyId(formData.legalEntityData?.item);

    setFormData((prev) => ({
      ...prev,
      currency_id: currencyId,
      currencyData: value,
      baseCurrencyId: baseCurrencyId || prev.baseCurrencyId,
    }));

    if (id) {
      handleFieldUpdate("currency_id", currencyId);
    }

    await applyLatestExchangeRate({
      currencyId,
      baseCurrencyId,
      invoiceDate: formData.invoice_date,
      forceRefresh: true,
      persist: !!id,
    });
  };

  const handleCurrencyClear = () => {
    setFormData((prev) => ({
      ...prev,
      currency_id: null,
      currencyData: null,
      exchange_rate: 1,
    }));
    didUserEditExchangeRateRef.current = false;
    if (id) {
      handleFieldUpdate("currency_id", null);
      handleFieldUpdate("exchange_rate", 1);
    }
  };

  const handleItemChange = (
    itemId: number | string,
    field: keyof InvoiceItem,
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };

          // Auto-populate price when product is selected
          if (field === "product") {
            const selectedProduct = products.find(
              (p: any) => p.value === value,
            );
            if (selectedProduct) {
              updatedItem.price = selectedProduct.price;
            }
          }

          // Recalculate item total
          const quantity = Number(updatedItem.quantity) || 0;
          const price = Number(updatedItem.price) || 0;
          const tax = Number(updatedItem.tax) || 0;
          const discountRate = Number(updatedItem.discount_rate) || 0;
          const subtotal = quantity * price;
          const discountAmount = (subtotal * discountRate) / 100;
          const taxableAmount = subtotal - discountAmount;
          const taxAmount = (taxableAmount * tax) / 100;
          updatedItem.total = taxableAmount + taxAmount;

          return updatedItem;
        }

        return item;
      }),
    }));
  };

  const mapLineItemsToForm = useCallback(
    (lineItems: any[]) => {
      const sortedByCreatedAt = [...(lineItems || [])].sort(
        (a: any, b: any) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return aTime - bTime;
        },
      );
      const mapped = sortedByCreatedAt.map((item: any, index: number) => ({
        id: item.id ?? index,
        product: item.item_master_id || item.product_id || "",
        period: item.period || "",
        quantity: item.quantity ?? item.invoice_qty ?? "",
        price: item.rate ?? item.price ?? "",
        tax: item.tax_master?.tax_rate ?? item.tax_rate ?? item.tax ?? "",
        discount_rate: item.discount_rate ?? "",
        discount_amount: item.discount_amount ?? 0,
        total: item.line_total ?? item.total ?? 0,
        item_name: item.item_name || item.item_master?.item_name || "",
        item_description:
          item.item_description || item.item_master?.item_description || "",
        item_number:
          item.item_number || item.item_master?.item_code || item.item_code,
        tax_group_id: item.tax_group_id || null,
        tax_group_name: item.tax_group?.name || null,
        classification_code:
          item.classification_code ||
          item.item_master?.classification_code ||
          item.item_master?.hsn_code ||
          null,
        classification_scheme:
          item.classification_scheme ||
          item.item_master?.classification_scheme ||
          null,
        tax_components: (item.invoice_line_tax || []).map((t: any) => ({
          rate: Number(t.rate) || 0,
          amount: Number(t.amount) || 0,
          component_type: t.component_type || t.tax_master?.component_type,
          tax_name: t.tax_master?.tax_name,
        })),
      }));
      return mapped;
    },
    [],
  );

  const applyInvoicePayload = useCallback(
    (invoiceData: any) => {
      if (!invoiceData?.invoice_line_item) return false;
      const mappedItems = mapLineItemsToForm(invoiceData.invoice_line_item);
      setInitialValues(invoiceData);
      setFormData((prev) => {
        const subTotal = mappedItems.reduce((sum, item) => {
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          return sum + qty * price;
        }, 0);
        const totalDiscount = mappedItems.reduce((sum, item) => {
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const discountRate = Number(item.discount_rate) || 0;
          return sum + (qty * price * discountRate) / 100;
        }, 0);
        const totalTax = mappedItems.reduce((sum, item) => {
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const discountRate = Number(item.discount_rate) || 0;
          const tax = Number(item.tax) || 0;
          const lineAfterDiscount =
            qty * price - (qty * price * discountRate) / 100;
          return sum + (lineAfterDiscount * tax) / 100;
        }, 0);
        const grandTotal =
          invoiceData?.invoice_total ?? subTotal - totalDiscount + totalTax;
        return {
          ...prev,
          items: mappedItems,
          subTotal,
          totalDiscount,
          totalTax,
          grandTotal,
        };
      });
      return true;
    },
    [mapLineItemsToForm],
  );

  // Update line item via API (for editing existing invoice)
  // Uses API response to update that particular row and totals (like purchase requisition)
  const updateLineItemApi = useCallback(
    async (itemId: string, field: string, value: any) => {
      if (!id) return;

      try {
        const fieldMapping: Record<string, string> = {
          quantity: "invoice_qty",
          price: "rate",
          tax: "tax_rate",
          discount_rate: "discount_rate",
          product: "item_master_id",
          period: "period",
          total: "total",
          tax_group_id: "tax_group_id",
          classification_code: "classification_code",
          classification_scheme: "classification_scheme",
        };
        const apiField = fieldMapping[field] || field;

        const res = (await viewAPI.updateChild(
          "invoice",
          id,
          "invoice_view",
          "invoice_line_item",
          itemId,
          { [apiField]: value },
        )) as any;

        // Prefer response data graph; fall back to full fetch if payload missing
        if (!applyInvoicePayload(res?.data) && id) {
          await fetchDetails(id);
        }
      } catch (error) {
        console.error("Error updating line item:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update line item",
        });
      }
    },
    [id, toast, applyInvoicePayload],
  );

  // Update line item when product is selected so that
  // DB fields like item_name, item_number, rate, tax_rate are also populated
  const updateLineItemFromProduct = useCallback(
    async (itemId: string, payload: any) => {
      if (!id) return;

      try {
        const res = (await viewAPI.updateChild(
          "invoice",
          id,
          "invoice_view",
          "invoice_line_item",
          itemId,
          payload,
        )) as any;

        if (!applyInvoicePayload(res?.data) && id) {
          await fetchDetails(id);
        }
      } catch (error) {
        console.error("Error updating line item from product:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update product details on line item",
        });
      }
    },
    [id, toast, applyInvoicePayload],
  );

  // Handle blur to save changes when editing
  const handleItemBlur = (
    itemId: number | string,
    field: string,
    value: any,
  ) => {
    if (id && typeof itemId === "string") {
      updateLineItemApi(itemId, field, value);
    }
  };

  const addItem = async () => {
    // Check if there's already an empty line item

    const hasEmptyItem = formData.items.some(
      (item) =>
        !item.product &&
        !item.item_name &&
        !item.quantity &&
        !item.price,
    );

    if (hasEmptyItem && formData.items.length > 0) {
      toast({
        title: "Empty Line Item Found",
        description:
          "Please complete the existing empty line item before adding a new one.",
        variant: "destructive",
      });
      return;
    }
    //   const response = await viewAPI.addChild(
    //     "invoice",
    //      id,
    //     "invoice_view",
    //     "invoice_line_item",
    //     {}
    // ) as any;
    // if(response.data){
    //   const sortedItems = response.data.invoice_line_item?.sort((a: any, b: any) => {
    //     // If items have created_at timestamps, use those
    //     if (a.created_at && b.created_at) {
    //         return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    //     }
    //     // Otherwise, sort by ID (deterministic fallback)
    //     return String(a.id).localeCompare(String(b.id));
    // });
    //   setInitialValues({
    //     ...response.data,
    //     invoice_line_item : sortedItems
    // });
    // }
    // If editing existing invoice, use API
    if (id) {
      setIsAddingItem(true);
      try {
        const nextItemNumber = String((formData.items?.length ?? 0) + 1);
        const response = (await viewAPI.addChild(
          "invoice",
          id,
          "invoice_view",
          "invoice_line_item",
          { item_number: nextItemNumber },
        )) as any;
        // Use returned data graph when present; otherwise refresh (UI fallback)
        if (!applyInvoicePayload(response?.data)) {
          await fetchDetails(id);
        }
      } catch (error) {
        console.error("Error adding line item:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to add line item",
        });
      } finally {
        setIsAddingItem(false);
      }
    } else {
      // For new invoices, add locally
      const newItem: InvoiceItem = {
        id: nextItemId,
        product: "",
        period: "",
        quantity: "",
        price: "",
        tax: "",
        discount_rate: "",
        discount_amount: 0,
        total: 0,
        item_name: "",
        item_description: "",
      };

      setFormData((prev) => ({
        ...prev,
        items: [...prev.items, newItem],
      }));

      setNextItemId((prev) => prev + 1);
    }
  };

  const handleLegalEntitySelectChange = async (
    sourceKey: any,
    key: string,
    value: any,
    fields: any,
  ) => {
    constructObject(value.item, fields);

    form.setValue(sourceKey, value[key]);
    form.trigger(sourceKey);
    didUserChangeLegalEntityRef.current = true;

    const sellerRegionId =
      value?.item?.default_tax_region_id ||
      value?.item?.default_tax_region?.id ||
      null;
    const sellerRegistration = value?.[key]
      ? await fetchPrimaryPartyTaxRegistration("entity", value[key])
      : null;
    const legalEntityId = value?.[key] || value?.item?.id || null;
    const taxCountryPack = await fetchEntityTaxPack(legalEntityId);
    const zeroRatedTaxGroup = await fetchZeroRatedTaxGroup(taxCountryPack);
    const taxTreatment =
      formData.customerData?.item?.tax_treatment ||
      formData.customerData?.tax_treatment ||
      null;
    const baseCurrencyId = resolveBaseCurrencyId(value);

    setFormData((prev) => ({
      ...prev,
      [sourceKey]: value[key],
      legalEntityData: value,
      seller_tax_region_id: sellerRegionId,
      sellerRegistration,
      taxCountryPack,
      zeroRatedTaxGroup,
      baseCurrencyId,
      // Default invoice currency to LE base when none chosen yet
      ...(prev.currency_id
        ? {}
        : {
            currency_id: baseCurrencyId,
            currencyData: value?.item?.currency
              ? { item: value.item.currency, id: baseCurrencyId }
              : prev.currencyData,
          }),
    }));
    setLegalEntity(value);

    if (!formData.currency_id) {
      const candidate = value?.item?.currency?.code || value?.item?.code;
      if (typeof candidate === "string" && candidate) {
        setInvoiceCurrencyCode(candidate);
      }
    }

    if (id) {
      handleFieldUpdate("legal_entity_id", value[key]);
      if (sellerRegionId) {
        handleFieldUpdate("seller_tax_region_id", sellerRegionId);
      }
      if (!formData.currency_id && baseCurrencyId) {
        handleFieldUpdate("currency_id", baseCurrencyId);
      }
    }

    await applyLatestExchangeRate({
      currencyId: formData.currency_id || baseCurrencyId,
      baseCurrencyId,
      invoiceDate: formData.invoice_date,
      forceRefresh: true,
      persist: !!id,
    });

    await resyncLineTaxGroups({
      sellerRegionId,
      placeOfSupplyId: formData.tax_region_id,
      items: formData.items,
      taxTreatment,
      zeroRatedTaxGroup,
    });
  };

  /**
   * Re-apply tax group suggestion on existing lines when seller region,
   * place of supply, or customer tax treatment changes.
   */
  const resyncLineTaxGroups = async (args: {
    sellerRegionId?: string | null;
    placeOfSupplyId?: string | null;
    items: InvoiceItem[];
    taxTreatment?: string | null;
    zeroRatedTaxGroup?: ZeroRatedTaxGroup | null;
  }) => {
    const sellerRegionId = args.sellerRegionId ?? null;
    const placeOfSupplyId = args.placeOfSupplyId ?? null;
    const taxTreatment = args.taxTreatment ?? null;
    const zeroRatedTaxGroup =
      args.zeroRatedTaxGroup ?? formData.zeroRatedTaxGroup ?? null;
    const lines = (args.items || []).filter((item) => item.product);
    if (lines.length === 0) return;

    const suggestions: Array<{
      id: number | string;
      tax_group_id: string | null;
      tax_group_name: string | null;
    }> = [];

    await Promise.all(
      lines.map(async (item) => {
        try {
          const res: any = await viewAPI.getById(
            "item_master",
            String(item.product),
            "item_master_view",
          );
          const product = res?.data;
          if (!product) return;

          const suggestedTaxGroupId = suggestTaxGroupId({
            sellerRegionId,
            placeOfSupplyId,
            defaultTaxGroupId: product.tax_group_id || product.tax_group?.id,
            interstateTaxGroupId:
              product.tax_group_interstate_id ||
              product.tax_group_interstate?.id,
            taxTreatment,
            zeroRatedTaxGroupId: zeroRatedTaxGroup?.id,
          });

          // Export with no GST0: clear domestic group rather than keep CGST/SGST.
          if (isExportTaxTreatment(taxTreatment)) {
            if (suggestedTaxGroupId === item.tax_group_id) return;
          } else if (
            !suggestedTaxGroupId ||
            suggestedTaxGroupId === item.tax_group_id
          ) {
            return;
          }

          const taxGroupName = !suggestedTaxGroupId
            ? null
            : suggestedTaxGroupId === zeroRatedTaxGroup?.id
              ? zeroRatedTaxGroup?.name || suggestedTaxGroupId
              : suggestedTaxGroupId ===
                  (product.tax_group_interstate_id ||
                    product.tax_group_interstate?.id)
                ? product.tax_group_interstate?.name || suggestedTaxGroupId
                : product.tax_group?.name || suggestedTaxGroupId;

          suggestions.push({
            id: item.id,
            tax_group_id: suggestedTaxGroupId,
            tax_group_name: taxGroupName,
          });
        } catch (err) {
          console.error("Failed to suggest tax group for line", item.id, err);
        }
      }),
    );

    if (suggestions.length === 0) return;

    const byId = new Map(suggestions.map((s) => [String(s.id), s]));
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const next = byId.get(String(item.id));
        return next
          ? {
              ...item,
              tax_group_id: next.tax_group_id,
              tax_group_name: next.tax_group_name,
            }
          : item;
      }),
    }));

    if (!id) return;

    for (const suggestion of suggestions) {
      if (typeof suggestion.id !== "string") continue;
      try {
        const res = (await viewAPI.updateChild(
          "invoice",
          id,
          "invoice_view",
          "invoice_line_item",
          suggestion.id,
          { tax_group_id: suggestion.tax_group_id },
        )) as any;
        if (res?.data?.invoice_line_item) {
          applyInvoicePayload(res.data);
        }
      } catch (err) {
        console.error("Failed to persist tax group for line", suggestion.id, err);
      }
    }

    // After multi-line updates, one refresh guarantees final components/totals
    await fetchDetails(id);
  };

  const handleCustomerSelectChange = async (
    sourceKey: any,
    key: string,
    value: any,
    fields: any,
  ) => {
    constructObject(value.item, fields);

    form.setValue(sourceKey, value[key]);
    form.trigger(sourceKey);

    const taxTreatment = value?.item?.tax_treatment || null;
    const isExport = isExportTaxTreatment(taxTreatment);
    // Export/overseas: do not stamp an IN place of supply from customer defaults.
    const placeOfSupplyId = isExport
      ? null
      : value?.item?.default_tax_region_id ||
        value?.item?.default_tax_region?.id ||
        null;
    const taxRegion = isExport
      ? null
      : value?.item?.default_tax_region ||
        (placeOfSupplyId
          ? { id: placeOfSupplyId, name: value?.item?.state }
          : null);
    const buyerRegistration = value?.[key]
      ? await fetchPrimaryPartyTaxRegistration("customer", value[key])
      : null;

    const sellerRegionId = formData.seller_tax_region_id;
    const currentItems = formData.items;
    let zeroRatedTaxGroup = formData.zeroRatedTaxGroup || null;
    if (isExport && !zeroRatedTaxGroup) {
      zeroRatedTaxGroup = await fetchZeroRatedTaxGroup(formData.taxCountryPack);
    }

    const preferredCurrencyId =
      value?.item?.preferred_currency_id || value?.item?.currency?.id || null;
    const preferredCurrency = value?.item?.currency || null;
    const baseCurrencyId =
      formData.baseCurrencyId ||
      resolveBaseCurrencyId(formData.legalEntityData);
    // Prefer customer currency when invoice currency not set yet
    const nextCurrencyId = formData.currency_id || preferredCurrencyId || baseCurrencyId;
    const nextCurrencyData = formData.currency_id
      ? formData.currencyData
      : preferredCurrency
        ? { item: preferredCurrency, id: preferredCurrencyId }
        : formData.currencyData;

    setFormData((prev) => ({
      ...prev,
      [sourceKey]: value[key],
      customerData: value,
      tax_region_id: placeOfSupplyId,
      taxRegionData: taxRegion
        ? { item: taxRegion, id: placeOfSupplyId, name: taxRegion.name }
        : null,
      buyerRegistration,
      tax_responsibility:
        value?.item?.tax_responsibility || prev.tax_responsibility || "taxable",
      zeroRatedTaxGroup: zeroRatedTaxGroup ?? prev.zeroRatedTaxGroup,
      currency_id: nextCurrencyId,
      currencyData: nextCurrencyData,
      baseCurrencyId: baseCurrencyId || prev.baseCurrencyId,
    }));
    setCustomer(value);

    if (!formData.currency_id && preferredCurrency?.code) {
      setInvoiceCurrencyCode(preferredCurrency.code);
    }

    if (id) {
      handleFieldUpdate("customer_id", value[key]);
      // Persist cleared POS for export, or customer default for domestic.
      handleFieldUpdate("tax_region_id", placeOfSupplyId);
      if (!formData.currency_id && nextCurrencyId) {
        handleFieldUpdate("currency_id", nextCurrencyId);
      }
    }

    if (!formData.currency_id && nextCurrencyId) {
      await applyLatestExchangeRate({
        currencyId: nextCurrencyId,
        baseCurrencyId,
        invoiceDate: formData.invoice_date,
        forceRefresh: true,
        persist: !!id,
      });
    }

    await resyncLineTaxGroups({
      sellerRegionId,
      placeOfSupplyId,
      items: currentItems,
      taxTreatment,
      zeroRatedTaxGroup,
    });
  };

  const handlePlaceOfSupplyChange = async (
    sourceKey: any,
    key: string,
    value: any,
  ) => {
    form.setValue(sourceKey, value[key]);
    form.trigger(sourceKey);
    const placeOfSupplyId = value[key] || null;
    const currentItems = formData.items;
    const sellerRegionId = formData.seller_tax_region_id;
    const taxTreatment =
      formData.customerData?.item?.tax_treatment ||
      formData.customerData?.tax_treatment ||
      null;

    setFormData((prev) => ({
      ...prev,
      tax_region_id: placeOfSupplyId,
      taxRegionData: value,
    }));
    if (id) {
      handleFieldUpdate("tax_region_id", placeOfSupplyId);
    }

    await resyncLineTaxGroups({
      sellerRegionId,
      placeOfSupplyId,
      items: currentItems,
      taxTreatment,
    });
  };

  const handleTaxGroupSelect = (
    itemId: number | string,
    taxGroupId: string | null,
    taxGroup?: any,
  ) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              tax_group_id: taxGroupId,
              tax_group_name: taxGroup?.name || taxGroupId || null,
            }
          : item,
      ),
    }));
    if (id && typeof itemId === "string") {
      updateLineItemApi(itemId, "tax_group_id", taxGroupId);
    }
  };

  const handleLoctionSelectChange = (
    sourceKey: any,
    key: string,
    value: any,
    fields: any,
  ) => {
    const billTo = formatLocationAddress(value.item);
    // Update form state
    form.setValue(sourceKey, value[key]);
    form.trigger(sourceKey);

    // Update local form data
    setFormData((prev) => ({
      ...prev,
      [sourceKey]: value[key],
      locationData: value,
      bill_to: billTo,
    }));
    setLocations(value);
    if (id) {
      handleFieldUpdate("location_id", value[key]);
      handleFieldUpdate("bill_to", billTo);
    }
  };

  const handleProductSelectChange = (
    sourceKey: any,
    key: string,
    value: any,
    fields: any,
  ) => {
    const resolveProductTaxRate = (product: any) => {
      if (!product) return null;
      const intraTax =
        typeof product.tax_rate_intra === "object"
          ? product.tax_rate_intra?.tax_rate
          : product.tax_rate_intra;
      const resolvedTax =
        intraTax ?? product.tax_master?.tax_rate ?? product.tax_rate ?? product.tax;
      return resolvedTax != null ? Number(resolvedTax) : null;
    };

    if (fields) {
      constructObject(value.item, fields);
    }
    // Extract item ID from sourceKey (format: "product_0" or "product_abcd")
    const itemIdStr = sourceKey.replace("product_", "").replace("_id", "");
    setProducts(value);

    const product = value?.item;
    const taxTreatment =
      formData.customerData?.item?.tax_treatment ||
      formData.customerData?.tax_treatment ||
      null;
    const suggestedTaxGroupId = suggestTaxGroupId({
      sellerRegionId: formData.seller_tax_region_id,
      placeOfSupplyId: formData.tax_region_id,
      defaultTaxGroupId: product?.tax_group_id || product?.tax_group?.id,
      interstateTaxGroupId:
        product?.tax_group_interstate_id || product?.tax_group_interstate?.id,
      taxTreatment,
      zeroRatedTaxGroupId: formData.zeroRatedTaxGroup?.id,
    });
    const taxGroupName =
      suggestedTaxGroupId &&
      suggestedTaxGroupId === formData.zeroRatedTaxGroup?.id
        ? formData.zeroRatedTaxGroup?.name
        : suggestedTaxGroupId &&
            suggestedTaxGroupId ===
              (product?.tax_group_interstate_id ||
                product?.tax_group_interstate?.id)
          ? product?.tax_group_interstate?.name
          : product?.tax_group?.name;

    // Update the specific item in the form data
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (String(item.id) !== itemIdStr) return item;

        const updatedItem = { ...item };
        updatedItem.product = value[key];

        if (product) {
          updatedItem.item_name =
            product.item_name ||
            product.name ||
            product.product_name ||
            product.title ||
            "";
          updatedItem.item_description =
            product.item_description ||
            product.description ||
            product.product_description ||
            product.desc ||
            "";
          updatedItem.classification_code =
            product.classification_code || product.hsn_code || null;
          updatedItem.classification_scheme =
            product.classification_scheme ||
            (product.hsn_code || product.classification_code ? "HSN" : null);
          updatedItem.tax_group_id = suggestedTaxGroupId;
          updatedItem.tax_group_name = taxGroupName || suggestedTaxGroupId;

          if (product.unit_price != null) {
            updatedItem.price = parseFloat(product.unit_price);
          }

          if (!suggestedTaxGroupId) {
            const resolvedTax = resolveProductTaxRate(product);
            if (resolvedTax != null) {
              updatedItem.tax = resolvedTax;
            }
          }
        }

        const quantity = Number(updatedItem.quantity) || 0;
        const price = Number(updatedItem.price) || 0;
        const tax = Number(updatedItem.tax) || 0;
        const discountRate = Number(updatedItem.discount_rate) || 0;
        const subtotal = quantity * price;
        const discountAmount = (subtotal * discountRate) / 100;
        const taxableAmount = subtotal - discountAmount;
        const taxAmount = (taxableAmount * tax) / 100;
        updatedItem.total = taxableAmount + taxAmount;

        return updatedItem;
      }),
    }));

    // Update via API when editing existing invoice
    const matchedItem = formData.items.find(
      (item) => String(item.id) === itemIdStr,
    );
    if (id && typeof matchedItem?.id === "string") {
      const payload: any = {
        item_master_id: value[key],
      };

      if (product) {
        payload.item_name = product.item_name ?? null;
        payload.item_number = product.item_code ?? null;
        payload.item_description = product.item_description ?? null;
        payload.item_type = product.item_type ?? null;
        payload.classification_code =
          product.classification_code || product.hsn_code || null;
        payload.classification_scheme =
          product.classification_scheme ||
          (product.hsn_code || product.classification_code ? "HSN" : null);

        if (product.unit_price != null) {
          payload.rate = Number(product.unit_price);
        }

        if (suggestedTaxGroupId) {
          payload.tax_group_id = suggestedTaxGroupId;
        } else {
          const resolvedTax = resolveProductTaxRate(product);
          if (resolvedTax != null) {
            payload.tax_rate = resolvedTax;
          }
        }
      }

      updateLineItemFromProduct(matchedItem.id, payload);
    }
  };
  const handleLocationSelectClear = async (sourceKey: any) => {
    form.setValue(sourceKey, null as never);
    form.trigger(sourceKey);
    setFormData((prev) => ({
      ...prev,
      location_id: null,
      locationData: null,
      bill_to: "",
    }));
    setLocations(null);
    setInitialValues((prev: any) =>
      prev
        ? { ...prev, location: null, location_id: null, bill_to: "" }
        : prev,
    );
    if (!id) return;
    try {
      const res = (await viewAPI.update("invoice", id, "invoice_view", {
        location_id: null,
        bill_to: "",
      })) as any;
      if (res?.data) {
        setInitialValues(res.data);
      }
    } catch (err: any) {
      console.error("Error clearing location:", err?.message);
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Failed to clear location",
      });
    }
  };
  const handleLegalEntitySelectClear = (sourceKey: any) => {
    form.setValue(sourceKey, "");
    form.trigger(sourceKey);

    // Update local form data
    setFormData((prev) => ({
      ...prev,
      [sourceKey]: "",
      legalEntityData: null,
      customerData: null,
    }));

    // Reset location and product data
    setLocations([]);
    setProducts([]);
  };
  const handleProductSelectClear = (sourceKey: any) => {
    // Extract item ID from sourceKey (works for numeric and string IDs)
    const itemIdStr = sourceKey.replace("product_", "").replace("_id", "");

    // Update the specific item in the form data
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (String(item.id) === itemIdStr) {
          const updatedItem = { ...item };
          updatedItem.product = "";
          updatedItem.period = "";
          updatedItem.item_name = "";
          updatedItem.item_description = "";
          updatedItem.price = "";
          updatedItem.tax = "";
          updatedItem.discount_rate = "";
          updatedItem.total = 0;
          updatedItem.tax_group_id = null;
          updatedItem.tax_group_name = null;
          updatedItem.classification_code = null;
          updatedItem.classification_scheme = null;
          updatedItem.tax_components = [];
          return updatedItem;
        }
        return item;
      }),
    }));

    // Persist clear for existing line items
    const matchedItem = formData.items.find(
      (item) => String(item.id) === itemIdStr,
    );
    if (id && typeof matchedItem?.id === "string") {
      updateLineItemFromProduct(matchedItem.id, {
        item_master_id: null,
        item_name: null,
        item_description: null,
        rate: 0,
        tax_rate: 0,
        discount_rate: 0,
        tax_group_id: null,
        classification_code: null,
        classification_scheme: null,
      });
    }
  };

  const handleItemSelection = (sourceKey: any, key: string, value: any) => {
    // This function handles product selection for invoice items
    // The sourceKey should contain the item ID
    const itemId = parseInt(sourceKey.replace("product_", ""));
    handleItemChange(itemId, "product", value[key]);
  };

  const removeItem = async (itemId: number | string) => {
    // If editing existing invoice, delete via API
    if (id && typeof itemId === "string") {
      try {
        await viewAPI.deleteChild(
          "invoice",
          id,
          "invoice_view",
          "invoice_line_item",
          itemId,
        );
        // Refresh to get updated items
        fetchDetails(id);
      } catch (error) {
        console.error("Error deleting line item:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to delete line item",
        });
      }
    } else {
      // For new invoices, remove locally
      setFormData((prev) => ({
        ...prev,
        items: prev.items.filter((item) => item.id !== itemId),
      }));
    }
  };

  const handlePreviewAndExport = async () => {
    try {
      if (
        !formData.invoice_number ||
        !formData.items ||
        formData.items.length === 0
      ) {
        toast({
          variant: "destructive",
          title: "Validation",
          description:
            "Please fill in all required fields and add at least one item before preview.",
        });
        return;
      }
      const invoiceData = {
        invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        due_date: computeDueDate(
          formData.invoice_date,
          formData.paymentTermsDays,
        ),
        items: formData.items.map((item) => ({
          product: item.product || "",
          period: item.period || "",
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          tax: Number(item.tax) || 0,
          total: Number(item.total) || 0,
          item_name: item.item_name || item.product || "",
          item_description: item.item_description || "",
          discount_rate: Number(item.discount_rate) || 0,
          discount_amount: Number(item.discount_amount) || 0,
          classification_code: item.classification_code || null,
          classification_scheme: item.classification_scheme || null,
          tax_group_name: item.tax_group_name || null,
          tax_components: item.tax_components || [],
        })),
        subTotal: Number(formData.subTotal) || 0,
        totalDiscount: Number(formData.totalDiscount) || 0,
        totalTax: Number(formData.totalTax) || 0,
        grandTotal: Number(formData.grandTotal) || 0,
        legalEntityData: { ...formData.legalEntityData, ...formData?.legalEntityData?.item },
        customerData: { ...formData.customerData, ...formData?.customerData?.item },
        locationData: formData.locationData
          ? {
              ...formData.locationData,
              ...(formData.locationData.item || {}),
            }
          : undefined,
        terms_and_conditions: formData.terms_and_conditions,
        notes: formData.notes,
        adjustable_label: formData.adjustable_label,
        adjustable_value: Number(formData.adjustable_value) || 0,
        bill_to:
          formData.bill_to ||
          formatLocationAddress(
            formData.locationData?.item || initialValues?.location,
          ),
        sellerRegistration: formData.sellerRegistration,
        buyerRegistration: formData.buyerRegistration,
        taxRegionName:
          formData.taxRegionData?.item?.name ||
          formData.taxRegionData?.name ||
          null,
        registrationLabel: resolveTaxPack(formData.taxCountryPack).registrationLabel,
        regionLabel: resolveTaxPack(formData.taxCountryPack).regionLabel,
      };
      const blob = await pdf(
        <InvoicePDFDocument
          invoiceData={invoiceData}
          currencyCode={invoiceCurrencyCode}
          currencySymbol={invoiceCurrencySymbol}
          products={products}
          legalEntity={formData.legalEntityData ?? legalEntity}
          customer={formData.customerData ?? customer}
          locations={formData.locationData ?? locations}
        />,
      ).toBlob();

      const url = window.URL.createObjectURL(blob);
      const fileName = `invoice-${formData.invoice_number}.pdf`;
      setPdfPreviewUrl(url);
      setPdfPreviewFileName(fileName);
      setShowPdfPreviewModal(true);
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate PDF preview",
      });
    }
  };

  const handlePdfPreviewModalClose = (open: boolean) => {
    if (!open && pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
      setPdfPreviewFileName("");
    }
    setShowPdfPreviewModal(open);
  };

  const updatePaymentReceiptApi = useCallback(
    async (paymentReceiptId: string, field: string, value: any) => {
      if (!id) return;

      setUpdatingPaymentReceiptId(paymentReceiptId);
      try {
        const res = (await viewAPI.updateChild(
          "invoice",
          id,
          "invoice_view",
          "payment_receipt",
          paymentReceiptId,
          { [field]: value },
        )) as any;

        if (res?.data) {
          setInitialValues(res.data);
        }

        // Ensure totals/balance refresh from source of truth
        fetchDetails(id);
      } catch (error: any) {
        console.error("Error updating payment receipt:", error);
      } finally {
        setUpdatingPaymentReceiptId(null);
      }
    },
    [id],
  );

  const deletePaymentReceiptApi = useCallback(
    async (paymentReceiptId: string) => {
      if (!id) return;

      setUpdatingPaymentReceiptId(paymentReceiptId);
      try {
        await viewAPI.deleteChild(
          "invoice",
          id,
          "invoice_view",
          "payment_receipt",
          paymentReceiptId,
        );

        fetchDetails(id);
      } catch (error: any) {
        console.error("Error deleting payment receipt:", error);
      } finally {
        setUpdatingPaymentReceiptId(null);
      }
    },
    [id],
  );

  const handleConfirmSubmit = async () => {
    try {
      setIsSubmitting(true);

      const submissionData = {
        ...formData,
        invoice_total: formData.grandTotal ?? initialValues?.invoice_total,
      };

      if (!id) {
        await viewAPI.create(
          "invoice",
          viewId || "invoice_view",
          submissionData,
        );
        toast({
          title: "Success",
          description: "Invoice created successfully",
        });
        navigate("/sales/invoices");
      } else {
        await viewAPI.update(
          "invoice",
          id,
          viewId || "invoice_view",
          submissionData,
        );
        toast({
          title: "Success",
          description: "Invoice updated successfully",
        });
      }
      navigate("/sales/invoices");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Something went wrong",
      });
      console.error("Error:", error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLegalEntityInitialCallback = (
    items: any[],
    setSelectedValue: (value: any) => void,
  ) => {
    // Initial/default selection: user hasn't manually changed it.
    didUserChangeLegalEntityRef.current = false;

    // Default legal entity selection:
    // - If `is_it_headquartres === "Yes"`, select it by default.
    // - Also push the selected id into react-hook-form + local formData so it is
    //   included in the create/update API payload.
    const headquartersItem = items.find(
      (item) => item.is_it_headquartres === "Yes",
    );
    const selected = headquartersItem ?? items?.[0];
    if (!selected) return;

    setSelectedValue(selected.id);

    // Mirror the payload shape produced by SearchDropDown's onSelectItem
    const selectedValueObj = {
      id: selected.id,
      legal_name:
        selected.legal_name || selected.organization_name || selected.name,
      item: selected,
    };

    form.setValue("legal_entity_id", selected?.id as never);
    form.trigger("legal_entity_id");

    const sellerRegionId =
      selected.default_tax_region_id ||
      selected.default_tax_region?.id ||
      null;
    const baseCurrencyId = resolveBaseCurrencyId(selected);

    setFormData((prev) => ({
      ...prev,
      legal_entity_id: selected.id,
      legalEntityData: selectedValueObj,
      seller_tax_region_id: sellerRegionId || prev.seller_tax_region_id,
      baseCurrencyId: baseCurrencyId || prev.baseCurrencyId,
      ...(prev.currency_id
        ? {}
        : {
            currency_id: baseCurrencyId,
            currencyData: selected.currency
              ? { item: selected.currency, id: baseCurrencyId }
              : prev.currencyData,
            exchange_rate: 1,
          }),
    }));
    setLegalEntity(selectedValueObj);

    // Load GSTIN + country pack + zero-rated group in background (dropdown init is sync)
    void (async () => {
      const [sellerRegistration, taxCountryPack] = await Promise.all([
        fetchPrimaryPartyTaxRegistration("entity", selected.id),
        fetchEntityTaxPack(selected.id),
      ]);
      const zeroRatedTaxGroup = await fetchZeroRatedTaxGroup(taxCountryPack);
      setFormData((prev) => ({
        ...prev,
        sellerRegistration,
        taxCountryPack: taxCountryPack || prev.taxCountryPack,
        zeroRatedTaxGroup: zeroRatedTaxGroup ?? prev.zeroRatedTaxGroup,
        seller_tax_region_id:
          sellerRegionId || prev.seller_tax_region_id,
      }));
      if (!didUserEditExchangeRateRef.current) {
        await applyLatestExchangeRate({
          currencyId: baseCurrencyId,
          baseCurrencyId,
          invoiceDate: formData.invoice_date,
          forceRefresh: true,
          persist: !!id,
        });
      }
    })();

    // Try to set currency immediately (if dropdown payload includes it)
    const candidate =
      selected?.currency?.code ||
      selected?.code;
    if (typeof candidate === "string" && candidate) {
      setInvoiceCurrencyCode(candidate);
    }
  };

  // If the invoice record exists but `legal_entity_id` is empty in DB,
  // persist the HQ legal entity (`is_it_headquartres = "Yes"`) automatically.
  // This avoids race conditions where the dropdown initial callback runs
  // before `fetchDetails()` finishes.
  useEffect(() => {
    if (!id) return;
    if (initialValues === null) return;

    // If user manually changed legal entity, do not overwrite with HQ.
    if (didUserChangeLegalEntityRef.current) return;

    const dbLegalEntityId = initialValues?.legal_entity_id;
    const dbHasValue =
      dbLegalEntityId !== null &&
      dbLegalEntityId !== undefined &&
      String(dbLegalEntityId).trim() !== "";

    if (dbHasValue) {
      didPersistHQLegalEntityRef.current = true;
      return;
    }

    if (didPersistHQLegalEntityRef.current) return;

    let cancelled = false;
    const persistHQ = async () => {
      try {
        const res: any = await viewAPI.search(
          "entity",
          "entity_view",
          1,
          1,
          "",
          { is_it_headquartres: { eq: "Yes" } },
          {},
        );

        const hq = Array.isArray(res?.data) ? res.data[0] : null;
        if (!cancelled && hq?.id) {
          didPersistHQLegalEntityRef.current = true;
          handleFieldUpdate("legal_entity_id", hq.id);
        } else if (!cancelled) {
          // Prevent repeated calls if HQ isn't found.
          didPersistHQLegalEntityRef.current = true;
        }
      } catch (e) {
        if (!cancelled) {
          didPersistHQLegalEntityRef.current = true;
          console.error("Failed to persist HQ legal_entity_id:", e);
        }
      }
    };

    persistHQ();
    return () => {
      cancelled = true;
    };
  }, [id, initialValues?.legal_entity_id, handleFieldUpdate]);
  // Function to generate dynamic invoice HTML

  const handleCancel = () => {
    navigate("/sales/invoices");
  };

  // Display currency: invoice currency first, else LE base.
  useEffect(() => {
    let cancelled = false;

    const fromInvoice =
      formData.currencyData?.item?.code ||
      formData.currencyData?.code ||
      initialValues?.currency?.code;
    if (typeof fromInvoice === "string" && fromInvoice) {
      setInvoiceCurrencyCode(fromInvoice);
      return;
    }

    const candidate =
      formData.legalEntityData?.item?.currency?.code ||
      legalEntity?.item?.currency?.code ||
      legalEntity?.item?.code;

    if (typeof candidate === "string" && candidate) {
      setInvoiceCurrencyCode(candidate);
      return;
    }

    const selectedLegalEntityId =
      formData.legal_entity_id || initialValues?.legal_entity_id;

    if (!selectedLegalEntityId) {
      setInvoiceCurrencyCode("INR");
      return;
    }

    const resolve = async () => {
      try {
        const res: any = await viewAPI.getById(
          "entity",
          selectedLegalEntityId,
          "entity_view",
        );
        const code = res?.data?.currency?.code;
        if (!cancelled) {
          setInvoiceCurrencyCode(
            typeof code === "string" && code ? code : "INR",
          );
        }
      } catch {
        if (!cancelled) setInvoiceCurrencyCode("INR");
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [
    formData.currency_id,
    formData.currencyData,
    formData.legal_entity_id,
    formData.legalEntityData,
    legalEntity,
    initialValues?.legal_entity_id,
    initialValues?.currency?.code,
  ]);

  const invoiceCurrencySymbol = currencyUtils.getCurrencyInfo(
    invoiceCurrencyCode,
  ).symbol;
  const taxPack = resolveTaxPack(formData.taxCountryPack);
  const showStructuredTax = taxPack.id !== "GENERIC";

  const getFormTitle = () =>
    id ? "Edit Invoice" : "New Invoice";


  return (
    <>
      <div className="max-w-7xl mx-auto px-2 md:px-4 space-y-4">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-border/60 pb-3">
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {getFormTitle()}
            </h1>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={handlePreviewAndExport}
                // size="sm"
                className="bg-primary hover:bg-primary/90"
              >
                Export
              </Button>
              <PdfViewerModal
                open={showPdfPreviewModal}
                onOpenChange={handlePdfPreviewModalClose}
                pdfUrl={pdfPreviewUrl}
                title={`Invoice ${formData.invoice_number || ""} – Preview`}
              />
              <Button
                type="button"
                onClick={() => setShowPaymentReceiptModal(true)}
                // size="sm"
                className="bg-primary hover:bg-primary/90"
                disabled={!id}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Payment Receipt
              </Button>
              <Button

                variant="outline" onClick={handleCancel}>
                Back to List
              </Button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlePreviewAndExport();
            }}
          >
            {/* Payment Receipts Table - shown below invoice grand totals */}
            {id && (
              <div className="mt-6" >
                <PaymentReceiptTable
                  paymentReceipts={initialValues?.payment_receipt || []}
                  currency={invoiceCurrencyCode}
                  showActions
                  onDelete={(pr) => deletePaymentReceiptApi(pr.id)}
                  updatingPaymentId={updatingPaymentReceiptId}
                />
              </div>
            )}
            <div className="mt-4">
              <Card className="border border-border/70 shadow-sm overflow-hidden rounded-lg">
                <CardContent className="p-5 md:p-6 space-y-7 bg-background">
                  {/* Basic Information Section */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label
                              htmlFor="customer"
                              className="mb-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              Customer Name{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <SearchDropDown
                              instanceType="customers"
                              instanceSourceKey="customer_id"
                              instanceKey="id"
                              instanceLabel="customer_name"
                              instanceValue={
                                formData.customerData?.item ||
                                initialValues?.customers
                              }
                              onSelectItem={handleCustomerSelectChange}
                              onClear={handleLegalEntitySelectClear}
                              createOptionLabel="+ Add new customer"
                              onCreateNew={() => setCustomerCreateOpen(true)}
                              limit="10"
                              searchParams="customer_name"
                              type="customers"
                            />
                            <QuickCustomerCreateDialog
                              open={customerCreateOpen}
                              onOpenChange={setCustomerCreateOpen}
                              onCreated={async (customerRow) => {
                                await handleCustomerSelectChange(
                                  "customer_id",
                                  "id",
                                  {
                                    id: customerRow.id,
                                    customer_name: customerRow.customer_name,
                                    item: customerRow,
                                  },
                                  [],
                                );
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor="legalEntity"
                              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              Legal Entity{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <SearchDropDown
                              instanceType="entity"
                              instanceSourceKey="legal_entity_id"
                              instanceKey="id"
                              instanceLabel="legal_name"
                              instanceValue={formData.legalEntityData?.item || initialValues?.legal_entity}
                              onSelectItem={handleLegalEntitySelectChange}
                              onClear={handleLegalEntitySelectClear}
                              {...(initialValues &&
                                (initialValues?.legal_entity_id === null ||
                                  initialValues?.legal_entity_id === undefined ||
                                  String(initialValues?.legal_entity_id).trim() === "") && {
                                initialCallback: handleLegalEntityInitialCallback,
                              })}
                              limit="10"
                              searchParams="legal_name"
                              type="invoice"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor="payment_terms"
                              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              Payment Terms{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <SearchDropDown
                              instanceType="payment_terms"
                              instanceSourceKey="payment_terms_id"
                              instanceKey="id"
                              instanceLabel="payment_terms"
                              instanceValue={
                                formData.paymentTermsData?.item ||
                                initialValues?.payment_terms ||
                                ""
                              }
                              onSelectItem={(sourceKey, key, value) => {
                                form.setValue(sourceKey, value[key]);
                                const days =
                                  value?.item?.no_of_days != null
                                    ? Number(value.item.no_of_days)
                                    : null;
                                setFormData((prev) => ({
                                  ...prev,
                                  payment_terms_id: value[key],
                                  paymentTermsData: value,
                                  paymentTermsDays: days,
                                }));
                                if (id) {
                                  handleFieldUpdate("payment_terms_id", value[key]);
                                }
                              }}
                              onClear={(sourceKey) => {
                                form.setValue(sourceKey, "");
                                setFormData((prev) => ({
                                  ...prev,
                                  payment_terms_id: "",
                                  paymentTermsData: null,
                                  paymentTermsDays: null,
                                }));
                                if (id) {
                                  // Empty string fails Prisma FK update; null clears cleanly
                                  handleFieldUpdate("payment_terms_id", null);
                                }
                              }}
                              limit="10"
                              searchParams="payment_terms"
                              type="payment_terms"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor="location"
                              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              Location <span className="text-destructive">*</span>
                            </Label>
                            <SearchDropDown
                              instanceType="location"
                              instanceSourceKey="location_id"
                              instanceKey="id"
                              instanceLabel="location"
                              instanceValue={
                                formData.location_id
                                  ? formData.locationData?.item ||
                                    initialValues?.location
                                  : undefined
                              }
                              onSelectItem={handleLoctionSelectChange}
                              onClear={handleLocationSelectClear}
                              searchParams="location"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Currency
                            </Label>
                            <SearchDropDown
                              instanceType="currency"
                              instanceSourceKey="currency_id"
                              instanceKey="id"
                              instanceLabel="code"
                              instanceValue={
                                formData.currencyData?.item ||
                                initialValues?.currency
                              }
                              onSelectItem={handleCurrencySelectChange}
                              onClear={handleCurrencyClear}
                              limit="20"
                              searchParams="code"
                              type="invoice"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor="exchange_rate"
                              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              Exchange Rate
                            </Label>
                            <Input
                              id="exchange_rate"
                              type="number"
                              step="any"
                              min="0"
                              placeholder="1"
                              value={
                                formData.exchange_rate == null
                                  ? ""
                                  : String(formData.exchange_rate)
                              }
                              onChange={(e) => {
                                didUserEditExchangeRateRef.current = true;
                                setFormData((prev) => ({
                                  ...prev,
                                  exchange_rate: e.target.value,
                                }));
                              }}
                              onBlur={() => {
                                const n = Number(formData.exchange_rate);
                                const rate =
                                  Number.isFinite(n) && n > 0 ? n : 1;
                                setFormData((prev) => ({
                                  ...prev,
                                  exchange_rate: rate,
                                }));
                                if (id) {
                                  handleFieldUpdate("exchange_rate", rate);
                                }
                              }}
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Latest rate to LE base currency; editable.
                            </p>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Customer Address
                            </Label>
                            <Textarea
                              readOnly
                              value={
                                formData.location_id
                                  ? formData.bill_to ||
                                    formatLocationAddress(
                                      formData.locationData?.item ||
                                        initialValues?.location,
                                    )
                                  : ""
                              }
                              placeholder="Select a location to view address"
                              className="min-h-[72px] border-border/70 bg-muted/30 resize-none"
                              rows={3}
                            />
                          </div>
                          {showStructuredTax ? (
                            <>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {taxPack.regionLabel}
                                </Label>
                                <SearchDropDown
                                  instanceType="tax_region"
                                  instanceSourceKey="tax_region_id"
                                  instanceKey="id"
                                  instanceLabel="name"
                                  instanceValue={
                                    formData.tax_region_id
                                      ? formData.taxRegionData?.item ||
                                        initialValues?.tax_region || {
                                          id: formData.tax_region_id,
                                          name:
                                            formData.taxRegionData?.name ||
                                            formData.tax_region_id,
                                        }
                                      : undefined
                                  }
                                  onSelectItem={handlePlaceOfSupplyChange}
                                  onClear={() => {
                                    setFormData((prev) => ({
                                      ...prev,
                                      tax_region_id: null,
                                      taxRegionData: null,
                                    }));
                                    if (id) {
                                      handleFieldUpdate("tax_region_id", null);
                                    }
                                    void resyncLineTaxGroups({
                                      sellerRegionId: formData.seller_tax_region_id,
                                      placeOfSupplyId: null,
                                      items: formData.items,
                                    });
                                  }}
                                  limit="20"
                                  searchParams="name"
                                  type="tax_region"
                                  additionalFilters={
                                    taxPack.id === "IN"
                                      ? { country_code: { eq: "IN" } }
                                      : taxPack.id === "CA"
                                        ? { country_code: { eq: "CA" } }
                                        : undefined
                                  }
                                />
                                <p className="text-[11px] text-muted-foreground">
                                  Defaults from the customer&apos;s tax region;
                                  override anytime (independent of bill-to
                                  address).
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Seller {taxPack.registrationLabel}
                                </Label>
                                <Input
                                  readOnly
                                  value={
                                    formData.sellerRegistration
                                      ?.registration_number || ""
                                  }
                                  placeholder={`No ${taxPack.registrationLabel} on file`}
                                  className="h-10 border-border/70 bg-muted/30"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Buyer {taxPack.registrationLabel}
                                </Label>
                                <Input
                                  readOnly
                                  value={
                                    formData.buyerRegistration
                                      ?.registration_number || ""
                                  }
                                  placeholder={`No ${taxPack.registrationLabel} on file`}
                                  className="h-10 border-border/70 bg-muted/30"
                                />
                              </div>
                            </>
                          ) : null}
                         
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Invoice #
                            </Label>
                            <Input
                              type="text"
                              value={formData.invoice_number}
                              onChange={(e) =>
                                handleInputChange("invoice_number", e.target.value)
                              }
                              onBlur={(e) => {
                                if (id) handleFieldUpdate("invoice_number", e.target.value);
                              }}
                              className="h-10 border-border/70"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Date
                            </Label>
                            <DatePicker
                              className="w-full h-10 px-3 py-2 border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              style={{ width: "100%" }}
                              value={
                                formData.invoice_date
                                  ? dayjs(formData.invoice_date)
                                  : null
                              }
                              onChange={(date) => {
                                const dateValue = date
                                  ? date.toDate().toISOString()
                                  : "";
                                invoiceDateRef.current = dateValue || null;
                                handleInputChange("invoice_date", dateValue);
                              }}
                              onOpenChange={(open) => {
                                if (
                                  !open &&
                                  id &&
                                  invoiceDateRef.current !== null
                                ) {
                                  handleFieldUpdate(
                                    "invoice_date",
                                    invoiceDateRef.current,
                                  );
                                }
                              }}
                              format="DD-MM-YYYY"
                              placeholder="Invoice Date"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Due Date
                            </Label>
                            <Input
                              readOnly
                              value={
                                computeDueDate(
                                  formData.invoice_date,
                                  formData.paymentTermsDays,
                                ) || ""
                              }
                              placeholder="Select date & payment terms"
                              className="h-10 border-border/70 bg-muted/30"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Items Section - moved to SalesInvoiceItemTable */}
                  <SalesInvoiceItemTable
                    items={formData.items}
                    currencyCode={invoiceCurrencyCode}
                    subTotal={formData.subTotal}
                    totalDiscount={formData.totalDiscount}
                    totalTax={formData.totalTax}
                    grandTotal={formData.grandTotal}
                    adjustableLabel={formData.adjustable_label ?? "Adjustable"}
                    adjustableValue={formData.adjustable_value ?? 0}
                    isAddingItem={isAddingItem}
                    taxGroupLabel={taxPack.taxGroupLabel}
                    classificationLabel={taxPack.classificationLabel}
                    showStructuredTax={showStructuredTax}
                    onAddItem={addItem}
                    onItemChange={handleItemChange}
                    onItemBlur={handleItemBlur}
                    onRemoveItem={removeItem}
                    onAdjustableLabelChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        adjustable_label: value,
                      }))
                    }
                    onAdjustableValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        adjustable_value: value,
                      }))
                    }
                    onAdjustableBlur={() => {
                      if (!id) return;
                      handleFieldUpdate(
                        "adjustable_label",
                        formData.adjustable_label ?? "Adjustable",
                      );
                      handleFieldUpdate(
                        "adjustable_value",
                        Number(formData.adjustable_value) || 0,
                      );
                    }}
                    onProductSelectChange={handleProductSelectChange}
                    onProductSelectClear={handleProductSelectClear}
                    onTaxGroupSelect={handleTaxGroupSelect}
                  />

                  {/* Zoho-style Notes, Terms and Attachments */}
                  <div className="pt-4 border-t border-border/60">
                    <div className="rounded-lg border border-border/70 bg-muted/10 divide-y divide-border/60">
                      <div className="p-4 space-y-2">
                        <Label
                          className="text-sm font-medium text-foreground"
                          htmlFor="notes"
                        >
                          Customer Notes
                        </Label>
                        <Textarea
                          id="notes"
                          placeholder="Thanks for your business."
                          value={formData.notes ?? ""}
                          onChange={(e) =>
                            handleInputChange("notes", e.target.value)
                          }
                          onBlur={() => {
                            if (id && formData.notes !== undefined) {
                              handleFieldUpdate("notes", formData.notes);
                            }
                          }}
                          className="min-h-[78px] border-border/70 bg-background resize-y"
                          rows={2}
                        />

                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]">
                        <div className="p-4 space-y-2 border-b lg:border-b-0 lg:border-r border-border/60">
                          <Label
                            className="text-sm font-medium text-foreground"
                            htmlFor="terms_and_conditions"
                          >
                            Terms &amp; Conditions
                          </Label>
                          <Textarea
                            id="terms_and_conditions"
                            placeholder="Enter the terms and conditions of your business to be displayed in your transaction."
                            value={formData.terms_and_conditions ?? ""}
                            onChange={(e) =>
                              handleInputChange("terms_and_conditions", e.target.value)
                            }
                            onBlur={() => {
                              if (id && formData.terms_and_conditions !== undefined) {
                                handleFieldUpdate("terms_and_conditions", formData.terms_and_conditions);
                              }
                            }}
                            className="min-h-[110px] border-border/70 bg-background resize-y"
                            rows={4}
                          />
                        </div>
                        <div className="p-4 space-y-2">
                          <p className="text-sm font-medium text-foreground">
                            Attach File(s) to Invoice
                          </p>
                          {id ? (
                            <Attachment model="invoice" id={id} />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Save invoice to enable attachments.
                            </p>
                          )}

                        </div>
                      </div>
                    </div>
                  </div>


                </CardContent>
              </Card>
            </div>

          </form>

          <PaymentReceiptModal
            isOpen={showPaymentReceiptModal}
            onClose={() => setShowPaymentReceiptModal(false)}
            invoiceId={id}
            invoiceData={initialValues}
            onSuccess={() => {
              if (id) {
                fetchDetails(id);
              }
            }}
          />
        </div>
      </div>
    </>
  );
};

export default InvoiceForm;
