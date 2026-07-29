export type InvoicePdfTemplateKey = "india_gst";

export interface InvoicePdfTemplate {
  taxPercentLabel: string;
  taxAmountLabel: string;
  dateFormat: string;
  bankDetailsTitle: string;
  bankDetailsLines: string[];
  termsTitle: string;
  termsLines: string[];
}

export const INVOICE_PDF_TEMPLATES: Record<
  InvoicePdfTemplateKey,
  InvoicePdfTemplate
> = {
  india_gst: {
    taxPercentLabel: "Tax (%)",
    taxAmountLabel: "Tax Amt",
    dateFormat: "DD-MM-YYYY",
    bankDetailsTitle: "Bank Details:",
    bankDetailsLines: [
      "Company Name: Hilka Digital (OPC) Private Limited",
      "Account No: 434011021133",
      "Bank Name: Kotak Bank",
      "Bank Address: 21, 2nd Avenue, MG Road, Adyar, Chennai - 600028, India",
      "SWIFT: KKBKINBB",
      "IFSC: KKBK0008491",
    ],
    termsTitle: "Terms & Conditions:",
    termsLines: ["LUT acknowledgement No.AD330422011602U"],
  },
};

