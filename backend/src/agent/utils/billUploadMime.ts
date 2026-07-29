/**
 * Purchase bill / receipt upload MIME allowlist + normalization.
 * Browsers often omit MIME for HEIC; resolve from extension before building data URIs.
 */

export const BILL_UPLOAD_MIME_ALLOWLIST = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type BillUploadMime = (typeof BILL_UPLOAD_MIME_ALLOWLIST)[number];

const EXT_TO_MIME: Record<string, BillUploadMime> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const ALIAS_TO_CANONICAL: Record<string, BillUploadMime> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
  'image/heif': 'image/heif',
};

export function extensionFromFileName(fileName?: string | null): string | null {
  const name = String(fileName || '').trim();
  if (!name) return null;
  const base = name.split(/[/\\]/).pop() || name;
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

export function isBillUploadMimeAllowed(mime?: string | null): mime is BillUploadMime {
  const key = String(mime || '').trim().toLowerCase();
  return Boolean(ALIAS_TO_CANONICAL[key]);
}

export type ResolveBillUploadMimeInput = {
  originalName?: string | null;
  mimetype?: string | null;
};

export type ResolveBillUploadMimeResult =
  | { ok: true; mime: BillUploadMime; source: 'mimetype' | 'extension' }
  | { ok: false; error: string; mime: null; source: null };

/**
 * Resolve a canonical MIME for bill upload /extract.
 * Prefer an allowlisted mimetype; otherwise map from filename extension
 * (needed when iOS sends empty or application/octet-stream for HEIC).
 */
export function resolveBillUploadMime(
  input: ResolveBillUploadMimeInput,
): ResolveBillUploadMimeResult {
  const rawMime = String(input.mimetype || '').trim().toLowerCase();
  const aliased = rawMime ? ALIAS_TO_CANONICAL[rawMime] : undefined;
  if (aliased) {
    return { ok: true, mime: aliased, source: 'mimetype' };
  }

  const ext = extensionFromFileName(input.originalName);
  if (ext && EXT_TO_MIME[ext]) {
    // Empty / generic / wrong MIME with a known extension → trust extension
    const generic =
      !rawMime ||
      rawMime === 'application/octet-stream' ||
      rawMime === 'binary/octet-stream';
    if (generic || !aliased) {
      return { ok: true, mime: EXT_TO_MIME[ext], source: 'extension' };
    }
  }

  const hint = rawMime || (ext ? `.${ext}` : 'unknown');
  return {
    ok: false,
    mime: null,
    source: null,
    error: `Unsupported bill upload type (${hint}). Allowed: PDF, JPEG, PNG, WebP, HEIC, HEIF.`,
  };
}

/** Build a data URI with a resolved MIME (never empty type). */
export function buildBillUploadDataUri(mime: BillUploadMime, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export const BILL_UPLOAD_ACCEPT_ATTR =
  '.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,image/heic,image/heif,application/pdf,image/jpeg,image/png,image/webp';

export const BILL_UPLOAD_HELPER_TEXT =
  'PDF or a photo of the receipt (JPEG, PNG, HEIC, WebP), up to 10MB.';
