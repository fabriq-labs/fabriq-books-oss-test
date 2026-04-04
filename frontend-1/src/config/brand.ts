/**
 * Brand config: app name, tagline, logo/favicon paths.
 * Populated from config/<APP_NAME>/ by config/scripts/select-brand.js.
 */
import brandConfig from './config.json';

export interface BrandConfig {
  appName: string;
  appTagline: string;
  sidebarFallbackName: string;
  copyright: string;
  appId: string;
  metaDescription?: string;
  ogUrl?: string;
}

const config = brandConfig as BrandConfig;

export const appName = config.appName;
export const appTagline = config.appTagline;
export const sidebarFallbackName = config.sidebarFallbackName;
export const copyright = config.copyright;
export const appId = config.appId;

import faviconSvg from './favicon.svg';
import logoSvg from './logo.svg';

/** URL to favicon (for use in img src or link href). */
export const faviconPath = faviconSvg;
/** URL to logo. */
export const logoPath = logoSvg;

export default config;
