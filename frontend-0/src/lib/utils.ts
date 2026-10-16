import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Truncates text to a specified maximum length and adds ellipsis if truncated
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 30)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string | undefined | null, maxLength: number = 30): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
