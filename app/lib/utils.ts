import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import crypto from "crypto"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function stableHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function generateIdempotencyKey(payload: any): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

