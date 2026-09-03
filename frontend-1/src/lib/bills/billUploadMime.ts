/**
 * Purchase bill upload MIME allowlist (browser).
 * Keep in sync with backend/src/agent/utils/billUploadMime.ts
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

export type BillUploadMimeResolveResult =
  | { readonly ok: true; mime: BillUploadMime }
  | { readonly ok: false; error: string };

export function resolveBillUploadMime(input: {
  originalName?: string | null;
  mimetype?: string | null;
}): BillUploadMimeResolveResult {
  const rawMime = String(input.mimetype || '').trim().toLowerCase();
  const aliased = rawMime ? ALIAS_TO_CANONICAL[rawMime] : undefined;
  if (aliased) return { ok: true as const, mime: aliased };

  const ext = extensionFromFileName(input.originalName);
  if (ext && EXT_TO_MIME[ext]) {
    return { ok: true as const, mime: EXT_TO_MIME[ext] };
  }

  const hint = rawMime || (ext ? `.${ext}` : 'unknown');
  return {
    ok: false as const,
    error: `Unsupported file type (${hint}). Use PDF or a photo (JPEG, PNG, HEIC, WebP).`,
  };
}

export function isBillUploadFileAllowed(file: File): boolean {
  return resolveBillUploadMime({
    originalName: file.name,
    mimetype: file.type,
  }).ok;
}

export const BILL_UPLOAD_ACCEPT_ATTR =
  '.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,image/heic,image/heif,application/pdf,image/jpeg,image/png,image/webp';

export const BILL_UPLOAD_HELPER_TEXT =
  'PDF or a photo of the receipt (JPEG, PNG, HEIC, WebP), up to 10MB.';
