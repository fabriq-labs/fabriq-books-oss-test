# Import Upload Flow (CSV, PDF, PDF Discard)

This document describes the final two-pass import lineage flow:

- CSV upload
- PDF parse + mapper confirm upload
- PDF discard from mapper

All source files are handled as binary (`multipart/form-data`) and stored through `StorageAdapter`.

---

## 1) CSV Upload (Single-pass)

### Frontend (`frontend-0/src/components/import/ImportPannel.tsx`)

1. User maps CSV columns in mapper.
2. `handleOnServerUpload(...)` builds payload:
   - `mapping`
   - `data`
   - optional `parentData`
   - `importMeta` (file metadata for first-time upload)
3. Frontend creates `FormData`:
   - `payload` = `JSON.stringify(formattedData)`
   - `file` = CSV `File` (binary) when no existing `import_id`
4. Calls `importAPI.uploadData(modelType, modelView, formData)`.

### Backend route/controller

Files:
- `backend/src/rest/routes.ts`
- `backend/src/rest/RestService.ts`

1. Route `POST /api/:model/view/:viewId/upload` uses `upload.single('file')`.
2. `RestService.uploadCSV(...)`:
   - parses `req.body.payload`
   - reads `req.file.buffer` if present
   - passes parsed payload + binary source file to `UploadService.uploadCSV(...)`.

### Backend service/audit

Files:
- `backend/src/services/upload/UploadService.ts`
- `backend/src/services/import/ImportAuditService.ts`

1. `UploadService` checks `importMeta.import_id` (and top-level fallback).
2. If no `import_id`, creates run via `ImportAuditService.createRun(...)`.
3. If file buffer exists, run stores source file path and writes file.
4. Upload pipeline updates run:
   - `markProcessing(...)`
   - `markSuccess(...)` / `markFailure(...)` with totals.

---

## 2) PDF Upload (Two-pass)

### Pass 1: Parse PDF

Frontend files:
- `frontend-0/src/components/import/ImportPannel.tsx`
- `frontend-0/src/features/import-extensions/`

Backend file:
- `backend/src/rest/RestService.ts` (`parseDocument`)

Steps:

1. Frontend sends PDF as multipart binary to `/api/parse-document/:modelName`.
2. Backend validates file and reads `req.file.buffer` as `pdfBuffer`.
3. Backend creates `import_run` (`RECEIVED` -> `PROCESSING`) and stores PDF in storage.
4. Backend parses/extracts data and returns `import_id` in response.
5. Pass-1 does **not** finalize run as `SUCCESS`; final status/counts are decided in pass-2.

### Pass 2: Mapper Confirm Upload

Frontend file:
- `frontend-0/src/components/import/ImportPannel.tsx`

Steps:

1. Frontend reuses `currentImportId` from parse response.
2. Frontend sends only:
   - mapped data
   - `importMeta.import_id`
3. Frontend does **not** send:
   - binary file
   - file metadata
4. Backend `UploadService` reuses the same run and updates:
   - `records_total`
   - `records_success`
   - `records_failed`
   - final `status` (`SUCCESS` / `FAILED`).

---

## 3) PDF Discard Flow (Mapper -> ABANDONED)

### Frontend

Files:
- `frontend-0/src/components/import/CsvMapper.tsx`
- `frontend-0/src/components/import/ImportPannel.tsx`

Steps:

1. User clicks **Discard** in mapper.
2. `CsvMapper` triggers `onDiscard`.
3. `ImportPannel.handleDiscardImport()` calls:
   - `importAPI.discardImportRun(currentImportId, 'user_discarded_in_mapper')`
4. On success, frontend clears mapper state.

### Backend

Files:
- `backend/src/rest/routes.ts`
- `backend/src/rest/RestService.ts`
- `backend/src/services/import/ImportAuditService.ts`

Steps:

1. Endpoint: `POST /api/import_run/:id/discard`
2. Route is registered before generic `/:model/:id/:relation` routes (important to avoid misrouting).
3. `RestService.discardImportRun(...)` calls `ImportAuditService.markAbandoned(...)`.
4. Run is updated with:
   - `status = ABANDONED`
   - `completed_at = now`
   - `discard_reason` (default `user_discarded_in_mapper`).

---

## 4) Storage Behavior

File: `backend/src/services/dal/storage.ts`

- `writeFile(buffer, relativePath)`:
  - local: `LOCAL_ROOT_DIR/<relativePath>`
  - gcs: `<bucket>/<relativePath>`
- `resolveFullPath(relativePath)`:
  - local absolute path
  - `gs://...` for GCS

Expected path pattern:

- `imports/<org_id>/<import_id>/<original_file_name>`

---

## 5) Quick Validation Checklist

1. CSV upload creates/updates one run and updates totals/status.
2. PDF pass-1 stores file and returns `import_id`, but does not finalize to `SUCCESS`.
3. PDF pass-2 uses same `import_id` and finalizes totals/status.
4. Discard from mapper hits `/api/import_run/:id/discard` and marks `ABANDONED`.

