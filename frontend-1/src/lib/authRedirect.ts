const PUBLIC_AUTH_ROUTES = ["/sign-in", "/signup", "/auth"];

/** Sign-in URL carrying the originally-requested page, so login can return there. */
export function buildSignInRedirect(pathname: string, search: string): string {
  if (PUBLIC_AUTH_ROUTES.includes(pathname)) return "/sign-in";
  const target = `${pathname}${search}`;
  return `/sign-in?redirect=${encodeURIComponent(target)}`;
}

/**
 * Reads the `redirect` param off the sign-in URL's query string. Only
 * accepts an in-app relative path — rejects protocol-relative ("//evil.com")
 * or absolute URLs to guard against open-redirect via a crafted link.
 */
export function getSafeRedirectTarget(search: string): string {
  const raw = new URLSearchParams(search).get("redirect");
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (PUBLIC_AUTH_ROUTES.some((route) => raw.startsWith(route))) return "/";
  return raw;
}
