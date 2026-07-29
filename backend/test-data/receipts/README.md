# Sample bill / receipt images

Synthetic fixtures for purchase bill upload MIME + extract testing.

| File | Format | Notes |
|------|--------|--------|
| `sample-receipt.jpg` | JPEG | Clean office-supply tax invoice layout |
| `sample-receipt-phone.jpg` | JPEG | Same layout, lower quality (phone-like) |
| `sample-receipt.png` | PNG | Same layout |
| `sample-receipt.webp` | WebP | Same layout |

Amounts: subtotal 3400 + CGST/SGST 9% each → total INR 4012.  
Vendor GSTIN on image: `29AABCU9603R1ZM` (fictional; not a seeded demo supplier).

HEIC/HEIF: no binary fixture here (no encoder in CI). MIME resolution for `.heic` / empty/`octet-stream` is covered by unit tests in `backend/src/__tests__/agent/billUploadMime.test.ts`.

Optional live LLM: `RUN_RECEIPT_LLM_EXTRACT=1` with a configured vision provider key in `backend/.env` (see `receipt-image-extract.test.ts`).
