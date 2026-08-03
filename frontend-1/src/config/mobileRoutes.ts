/**
 * Desktop -> mobile route mapping. Add an entry here whenever a new page
 * gets a mobile-friendly (/m/...) equivalent — nothing else needs to change
 * for phone users to be routed to it automatically.
 */
export const MOBILE_ROUTE_MAP: Record<string, string> = {
  "/": "/m/investments/portfolio",
  "/investments/portfolio": "/m/investments/portfolio",
  "/investments/options-income": "/m/investments/options-income",
};

const MOBILE_OPT_OUT_KEY = "fabriq_mobile_opt_out";

/** User explicitly chose "Full site" from the mobile shell. */
export function isMobileOptedOut(): boolean {
  return localStorage.getItem(MOBILE_OPT_OUT_KEY) === "true";
}

export function setMobileOptedOut(optedOut: boolean): void {
  if (optedOut) {
    localStorage.setItem(MOBILE_OPT_OUT_KEY, "true");
  } else {
    localStorage.removeItem(MOBILE_OPT_OUT_KEY);
  }
}
