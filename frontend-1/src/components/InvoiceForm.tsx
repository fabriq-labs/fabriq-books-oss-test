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
import { formatCurrency } from "@/lib/formatters";
import { currencyUtils } from "@/utils/currencyUtils";
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
}

interface InvoiceFormData {
  legal_entity_id: string;
  legalEntityData: any;
  customer_id?: string;
  customerData: any;
  location_id: string;
  locationData: any;
  payment_terms_id?: string;
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
    location_id: "",
    locationData: null,
    payment_terms_id: "",
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
  });

  const [nextItemId, setNextItemId] = useState(1);
  const [initialValues, setInitialValues] = useState<any>(null);
  const didPersistHQLegalEntityRef = useRef(false);
  const [invoiceCurrencyCode, setInvoiceCurrencyCode] = useState<string>("INR");
  const didUserChangeLegalEntityRef = useRef(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState<string>("");
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

  const fetchDetails = (invoiceId: any) => {
    viewAPI.getById("invoice", invoiceId, "invoice_view").then((res: any) => {
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
      const locationData = res.data.location
        ? {
          item: res.data.location,
          location:
            res.data.location.location ||
            res.data.location.address ||
            res.data.location.city,
        }
        : null;
      setFormData((prev) => ({
        ...prev,
        legal_entity_id: res.data.legal_entity_id,
        customer_id: res.data.customer_id,
        location_id: res.data.location_id,
        legalEntityData: legalEntityData || prev.legalEntityData,
        customerData: customerData || prev.customerData,
        locationData: locationData || prev.locationData,
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
      }));

      // Update nextItemId to avoid conflicts
      const maxId = Math.max(
        ...items.map((item: InvoiceItem) =>
          typeof item.id === "number" ? item.id : 0,
        ),
        0,
      );
      setNextItemId(maxId + 1);
    });
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
      }));
      return mapped;
    },
    [],
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

        // Use API response to update the row and totals (like purchase requisition)
        if (res?.data?.invoice_line_item) {
          const mappedItems = mapLineItemsToForm(res.data.invoice_line_item);
          setInitialValues(res.data);
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
              const lineAfterDiscount = qty * price - (qty * price * discountRate) / 100;
              return sum + (lineAfterDiscount * tax) / 100;
            }, 0);
            const grandTotal = res.data?.invoice_total ?? subTotal - totalDiscount + totalTax;
            return {
              ...prev,
              items: mappedItems,
              subTotal,
              totalDiscount,
              totalTax,
              grandTotal,
            };
          });
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
    [id, toast, mapLineItemsToForm],
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

        if (res?.data?.invoice_line_item) {
          const mappedItems = mapLineItemsToForm(res.data.invoice_line_item);
          setInitialValues(res.data);
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
              const lineAfterDiscount = qty * price - (qty * price * discountRate) / 100;
              return sum + (lineAfterDiscount * tax) / 100;
            }, 0);
            const grandTotal = res.data?.invoice_total ?? subTotal - totalDiscount + totalTax;
            return {
              ...prev,
              items: mappedItems,
              subTotal,
              totalDiscount,
              totalTax,
              grandTotal,
            };
          });
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
    [id, toast, mapLineItemsToForm],
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
        if (response?.data) {
          // Re-fetch full invoice so all line items (not just the new one)
          // are loaded and shown in SalesInvoiceItemTable
          fetchDetails(id);
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

  const handleLegalEntitySelectChange = (
    sourceKey: any,
    key: string,
    value: any,
    fields: any,
  ) => {
    const lookupData = constructObject(value.item, fields);

    // Update form state
    form.setValue(sourceKey, value[key]);
    form.trigger(sourceKey);

    // User-manual change: prevent HQ auto-persist from overriding this.
    didUserChangeLegalEntityRef.current = true;

    // Update local form data
    setFormData((prev) => ({
      ...prev,
      [sourceKey]: value[key],
      legalEntityData: value,
    }));
    setLegalEntity(value);

    // Update base currency immediately when user changes legal entity.
    const candidate =
      value?.item?.currency?.code ||
      value?.item?.currency?.code ||
      value?.item?.currency?.code ||
      value?.item?.code ||
      value?.item?.code;
    if (typeof candidate === "string" && candidate) {
      setInvoiceCurrencyCode(candidate);
    }

    if (id) {
      handleFieldUpdate("legal_entity_id", value[key]);
    }
  };

  const handleCustomerSelectChange = (
    sourceKey: any,
    key: string,
    value: any,
    fields: any,
  ) => {
    const lookupData = constructObject(value.item, fields);

    // Update form state
    form.setValue(sourceKey, value[key]);
    form.trigger(sourceKey);

    // Update local form data
    setFormData((prev) => ({
      ...prev,
      [sourceKey]: value[key],
      customerData: value,
    }));
    setCustomer(value);
    if (id) {
      handleFieldUpdate("customer_id", value[key]);
    }
  };
  const handleLoctionSelectChange = (
    sourceKey: any,
    key: string,
    value: any,
    fields: any,
  ) => {
    const lookupData = constructObject(value.item, fields);
    // Update form state
    form.setValue(sourceKey, value[key]);
    form.trigger(sourceKey);

    // Update local form data
    setFormData((prev) => ({
      ...prev,
      [sourceKey]: value[key],
      locationData: value,
    }));
    setLocations(value);
    if (id) {
      handleFieldUpdate("location_id", value[key]);
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

    const lookupData = constructObject(value.item, fields);
    // Extract item ID from sourceKey (format: "product_0" or "product_abcd")
    const itemIdStr = sourceKey.replace("product_", "").replace("_id", "");
    setProducts(value);
    // Update the specific item in the form data
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (String(item.id) === itemIdStr) {
          const updatedItem = { ...item };
          updatedItem.product = value[key];

          // Save item name and description from the selected product
          if (value.item) {
            updatedItem.item_name =
              value.item.item_name ||
              value.item.name ||
              value.item.product_name ||
              value.item.title ||
              "";
            updatedItem.item_description =
              value.item.item_description ||
              value.item.description ||
              value.item.product_description ||
              value.item.desc ||
              "";
          }

          // Auto-populate price and tax if available in the selected product
          if (value.item && value.item.unit_price) {
            updatedItem.price = parseFloat(value.item.unit_price);
          }
          if (value.item) {
            const resolvedTax = resolveProductTaxRate(value.item);
            if (resolvedTax != null) {
              updatedItem.tax = resolvedTax;
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
    // Update via API when editing existing invoice
    const matchedItem = formData.items.find(
      (item) => String(item.id) === itemIdStr,
    );
    if (id && typeof matchedItem?.id === "string") {
      const payload: any = {
        item_master_id: value[key],
      };

      if (value.item) {
        payload.item_name = value.item.item_name ?? null;
        payload.item_number = value.item.item_code ?? null;
        payload.item_description = value.item.item_description ?? null;
        payload.item_type = value.item.item_type ?? null;

        if (value.item.unit_price != null) {
          payload.rate = Number(value.item.unit_price);
        }

        // Prefer intra-state tax if present, otherwise tax_master.tax_rate, fallback to direct tax_rate
        const resolvedTax = resolveProductTaxRate(value.item);
        if (resolvedTax != null) {
          payload.tax_rate = resolvedTax;
        }
      }

      updateLineItemFromProduct(matchedItem.id, payload);
    }
  };
  const handleLocationSelectClear = (sourceKey: any) => {
    form.setValue(sourceKey, "");
    form.trigger(sourceKey);
    setFormData((prev) => ({
      ...prev,
      [sourceKey]: "",
      locationData: null,
    }));
    setLocations([]);
    setProducts([]);
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
        items: formData.items.map((item) => ({
          product: item.product || "",
          period: item.period || "",
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          tax: Number(item.tax) || 0,
          total: Number(item.total) || 0,
          item_name: item.item_name || item.product || "",
          item_description: item.item_description || "",
        })),
        subTotal: Number(formData.subTotal) || 0,
        totalTax: Number(formData.totalTax) || 0,
        grandTotal: Number(formData.grandTotal) || 0,
        legalEntityData: { ...formData.legalEntityData, ...formData?.legalEntityData?.item },
        customerData: { ...formData.customerData, ...formData?.customerData?.item },
        locationData: { ...formData.locationData, ...formData.locationData?.item },
        terms_and_conditions: formData.terms_and_conditions,
        notes: formData.notes,
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

    setFormData((prev) => ({
      ...prev,
      legal_entity_id: selected.id,
      legalEntityData: selectedValueObj,
    }));
    setLegalEntity(selectedValueObj);

    // Try to set currency immediately (if dropdown payload includes it)
    const candidate =
      selected?.currency?.code ||
      selected?.currency?.code ||
      selected?.currency?.code ||
      selected?.code ||
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

  // Currency for totals/PDF should come from the selected legal entity.
  // If not present in the dropdown payload, we resolve it via `organization_view` using `legal_entity_id`.
  useEffect(() => {
    let cancelled = false;

    const candidate =
      formData.legalEntityData?.item?.currency?.code ||
      formData.legalEntityData?.item?.currency?.code ||
      formData.legalEntityData?.item?.currency?.code ||
      formData.legalEntityData?.item?.code ||
      formData.legalEntityData?.item?.code ||
      legalEntity?.item?.currency?.code ||
      legalEntity?.item?.currency?.code ||
      legalEntity?.item?.currency?.code ||
      legalEntity?.item?.code ||
      legalEntity?.item?.code;

    if (typeof candidate === "string" && candidate) {
      setInvoiceCurrencyCode(candidate);
      return;
    }

    const selectedLegalEntityId =
      formData.legal_entity_id || initialValues?.legal_entity_id;

    if (!selectedLegalEntityId) {
      // Never pass `undefined` into `currencyUtils.getCurrencyInfo()`
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
        const org = res?.data;

        const code =
          org?.currency?.code ||
          org?.currency?.code ||
          org?.currency?.code ||
          org?.code ||
          org?.code;

        if (!cancelled) {
          setInvoiceCurrencyCode(
            typeof code === "string" && code ? code : "INR",
          );
        }
      } catch (e) {
        if (!cancelled) setInvoiceCurrencyCode("INR");
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [
    formData.legal_entity_id,
    formData.legalEntityData,
    legalEntity,
    initialValues?.legal_entity_id,
  ]);

  const invoiceCurrencySymbol = currencyUtils.getCurrencyInfo(
    invoiceCurrencyCode,
  ).symbol;

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
                              instanceValue={initialValues?.customers}
                              onSelectItem={handleCustomerSelectChange}
                              onClear={handleLegalEntitySelectClear}
                              limit="10"
                              searchParams="customer_name"
                              type="customers"
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
                              instanceValue={initialValues?.location}
                              onSelectItem={handleLoctionSelectChange}
                              onClear={handleLocationSelectClear}
                              searchParams="location"
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
                              instanceValue={initialValues?.payment_terms || ''}
                              onSelectItem={(sourceKey, key, value) => {
                                form.setValue(sourceKey, value[key]);
                                handleInputChange('payment_terms_id', value[key]);
                                if (id) {
                                  handleFieldUpdate('payment_terms_id', value[key]);
                                }
                              }}
                              onClear={(sourceKey) => {
                                form.setValue(sourceKey, '');
                                handleInputChange('payment_terms_id', '');
                                if (id) {
                                  handleFieldUpdate('payment_terms_id', '');
                                }
                              }}
                              limit="10"
                              searchParams="payment_terms"
                              type="payment_terms"
                            />
                          </div>
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
