/**
 * Resolve MIME / viewer kind for attachment preview.
 * No HEIC plugins — unsupported types get download-only messaging.
 */

export type AttachmentViewerKind = 'pdf' | 'image' | 'unsupported';

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Browser-native image types we show with <img> (no converters). */
const VIEWABLE_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
]);

export function extensionFromFileName(fileName?: string | null): string | null {
  const name = String(fileName || '').trim();
  if (!name) return null;
  const base = name.split(/[/\\]/).pop() || name;
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

export function mimeFromFileName(fileName?: string | null): string | null {
  const ext = extensionFromFileName(fileName);
  if (!ext) return null;
  return EXT_TO_MIME[ext] || null;
}

export function viewerKindFromMime(mime?: string | null): AttachmentViewerKind {
  const m = String(mime || '').trim().toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (VIEWABLE_IMAGE_MIME.has(m)) return 'image';
  return 'unsupported';
}

export function resolveAttachmentViewer(fileName?: string | null, blobType?: string | null): {
  mime: string;
  kind: AttachmentViewerKind;
} {
  const fromName = mimeFromFileName(fileName);
  const raw = String(blobType || '').trim().toLowerCase();
  const mime =
    fromName ||
    (raw && raw !== 'application/octet-stream' ? raw : '') ||
    'application/octet-stream';
  return { mime, kind: viewerKindFromMime(mime) };
}

/** Retype octet-stream blobs so iframe/img can display inline. */
export function blobForInlineView(blob: Blob, mime: string): Blob {
  if (blob.type === mime) return blob;
  return new Blob([blob], { type: mime });
}
