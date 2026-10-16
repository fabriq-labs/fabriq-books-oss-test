const PUBLIC_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/health',
  '/api/agent/health',
]);

/** Paths that may call next() with no authenticated user. */
export function isPublicAuthPath(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0];
  return PUBLIC_AUTH_PATHS.has(path);
}
