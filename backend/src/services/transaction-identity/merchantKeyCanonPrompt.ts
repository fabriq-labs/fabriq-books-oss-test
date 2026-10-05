/**
 * Shared merchant_key canonicalization rules for normalize + categorize LLM prompts.
 * Keep both call sites in sync to avoid key drift (exact hist match).
 */
export const MERCHANT_KEY_CANON_RULES = `Rules for merchant_key (exact-match identity; must be stable across runs):
- Output the shortest stable brand core that still uniquely identifies the merchant
- Drop generic suffixes when the brand remains clear: cafe, restaurant, grill, kitchen, store, market, shop, inc, llc, ltd, co, company, #digits, store numbers
  - "SOUL FISH CAFE" / "SOUL FISH" / "SOUL FISH CAFE GERMANTOWN" → "soul fish" (not "soul fish cafe")
  - "OFFICE DEPOT #1275" → "office depot"
- Expand truncated bank rail text to the full brand when clearly recognizable:
  - "… SHELBY DR MARATH" → "marathon" (not "marath")
  - "… KRISPY" alone is unsafe — only expand when brand is clear from remaining tokens
- Strip payment rails (DEBIT CARD PURCHASE, UPI, NEFT, POS, IMPS), dates, city/state, card last-4, street fragments when they are location noise
- Prefer possessives/punctuation forms that match common brand spelling: "j alexander's", "mcdonald's"
- Do NOT use city-only or street-only keys (e.g. "memphis", "shelby dr")
- Do NOT invent a different company when unsure — keep the longest recognizable merchant token(s)
- lowercase, single spaces, no leading/trailing punctuation
- Same merchant → same key every time, regardless of which optional tokens appear in this description`;

export const MERCHANT_KEY_FEW_SHOTS = `Examples (description → merchant_key):
- "DEBIT CARD PURCHASE-PIN 12-27-24 MEMPHIS TN 2356 KRISPY KREME #1234" → "krispy kreme"
- "DEBIT CARD PURCHASE-PIN 11-15-24 MEMPHIS 2356 SHELBY DR MARATH" → "marathon"
- "DEBIT CARD PURCHASE SOUL FISH CAFE GERMANTOWN TN 4412" → "soul fish"
- "SOUL FISH" → "soul fish"
- "J ALEXANDER'S REST MEMPHIS" → "j alexander's"
- "UPI/DR/423156789012/SWIGGY INDIA PVTLTD/OKICICI" → "swiggy"
- "OFFICE DEPOT 00 1275 S GE" → "office depot"
- "AMAZON.COM*AB123 AMZN.COM/BILL WA" → "amazon"`;
