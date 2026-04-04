import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json || json === 'undefined') return fallback;
  try {
    return JSON.parse(json) as T;
  } catch (e) {
    // Silent fail for non-JSON strings as this is used for "trying" to parse error messages
    return fallback;
  }
}
