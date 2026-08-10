import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Console-local on purpose. The bundler must never cross the app boundary
// (only TYPES do, via the tsconfig fallback path — the mobile/ rule):
// Turbopack refuses imports outside its project root, and widening the root
// to the repo breaks OpenNext's standalone layout. So the console carries its
// own tiny cn() instead of reaching for the main app's lib/utils.

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
