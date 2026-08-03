const MOBILE_UA_PATTERN = /Android|iPhone|iPod|Mobile/i;

/**
 * Detects actual phone-class devices via user agent — distinct from
 * `useIsMobile` (viewport width), which is used for responsive layout only
 * and would also fire for a narrow desktop browser window.
 * Deliberately excludes iPad/tablets, which stay on the desktop UI.
 */
export function useIsMobileDevice(): boolean {
  return MOBILE_UA_PATTERN.test(navigator.userAgent);
}
