import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compact Indian-rupee formatter used across the analytics dashboard.
 * ₹1,20,000 → "₹1.2L", ₹12,000 → "₹12.0K", ₹500 → "₹500".
 * One canonical implementation so the same value never renders two ways.
 */
export function formatInr(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}
