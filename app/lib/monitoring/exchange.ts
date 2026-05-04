const CACHE_MS = 60 * 60 * 1000; // 1 jam
let cached: { rate: number; updatedAt: string; expiresAt: number } | null = null;

export async function fetchUsdToIdr(): Promise<{ rate: number; updatedAt: string }> {
  if (cached && Date.now() < cached.expiresAt) {
    return { rate: cached.rate, updatedAt: cached.updatedAt };
  }
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=IDR');
    const json = await res.json() as { rates: { IDR: number }; date: string };
    const rate = json.rates.IDR;
    cached = { rate, updatedAt: json.date, expiresAt: Date.now() + CACHE_MS };
    return { rate, updatedAt: json.date };
  } catch {
    if (cached) return { rate: cached.rate, updatedAt: cached.updatedAt };
    return { rate: 16500, updatedAt: 'fallback' };
  }
}
