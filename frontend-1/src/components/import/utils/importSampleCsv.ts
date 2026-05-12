/**
 * Static import sample CSVs are served from `public/<IMPORT_SAMPLE_CSV_PUBLIC_PATH>/{modelType}.csv`
 * (modelType matches Master `type`, e.g. location, supplier, item_master, customers).
 *
 * Files live in `frontend-1/public/download_csv/` by default.
 */
export const IMPORT_SAMPLE_CSV_PUBLIC_PATH = "download_csv";

export function buildImportSampleCsvUrl(modelType: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");
  const safe = encodeURIComponent(modelType);
  const segment = IMPORT_SAMPLE_CSV_PUBLIC_PATH.replace(/^\/+|\/+$/g, "");
  return `${base}/${segment}/${safe}.csv`;
}

/**
 * Dev servers and SPA hosts often return `index.html` (200) for unknown paths.
 * Without this check, users download HTML thinking it is CSV.
 */
export function responseBodyLooksLikeCsv(
  body: string,
  contentType: string | null
): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;

  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/xhtml")) {
    return false;
  }

  const probe = trimmed.slice(0, 128).toLowerCase();
  if (
    probe.startsWith("<!doctype") ||
    probe.startsWith("<html") ||
    probe.startsWith("<head") ||
    probe.startsWith("<body")
  ) {
    return false;
  }

  return true;
}
