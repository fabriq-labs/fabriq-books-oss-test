#!/usr/bin/env bash
# =============================================================================
# prod-bills-tax / 04_update_invoice_extractor_prompt.sh
# Updates prompt_template.prompt_text for invoice_extractor / fabriq_books
# from the repo prompt file (BP-2 extract fields).
#
# Usage:
#   PROD_DATABASE_URL='postgresql://...' \
#     bash docs/tax/migrations/prod-bills-tax/04_update_invoice_extractor_prompt.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PROMPT_FILE="${ROOT}/backend/prisma/metadata/prompt-templates/view_0e6394e6_edfc_4eba_947f_b1e47bc507f1_invoice_extractor_fabriq.txt"

if [[ -z "${PROD_DATABASE_URL:-}" ]]; then
  echo "ERROR: set PROD_DATABASE_URL" >&2
  exit 1
fi
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: prompt file missing: $PROMPT_FILE" >&2
  exit 1
fi

PROD_URL="$(printf '%s' "$PROD_DATABASE_URL" | sed 's/?schema=public//')"

python3 - "$PROMPT_FILE" <<'PY' | psql "$PROD_URL" -v ON_ERROR_STOP=1
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8")
# Dollar-quote body; choose tag unlikely to appear in prompt
tag = "ptxt_bills_bp2"
while tag in text:
    tag += "x"
print("BEGIN;")
print("UPDATE prompt_template")
print("SET prompt_text = $%s$%s$%s$," % (tag, text, tag))
print("    modified_at = CURRENT_TIMESTAMP")
print("WHERE prompt_type = 'invoice_extractor'")
print("  AND app_name = 'fabriq_books';")
print("SELECT prompt_type, app_name, length(prompt_text) AS prompt_len,")
print("       (prompt_text ILIKE '%supplier_tax_id%') AS mentions_supplier_tax_id,")
print("       (prompt_text ILIKE '%tax_components%') AS mentions_tax_components")
print("FROM prompt_template")
print("WHERE prompt_type = 'invoice_extractor' AND app_name = 'fabriq_books';")
print("COMMIT;")
PY

echo "OK: invoice_extractor prompt updated for app_name=fabriq_books"
