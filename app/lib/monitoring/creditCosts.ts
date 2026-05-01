// Credit costs per generation — source: useapi.net/docs/api-google-flow-v1
// 1 credit = $0.005 USD (official Google AI pricing)
export const GOOGLE_FLOW_CREDIT_COSTS: Record<string, number> = {
  'veo-3.1-lite':    5,
  'veo-3.1-fast':    10,
  'veo-3.1-quality': 100,
  'imagen-4':        0,   // free with any Google AI subscription
};

export const GOOGLE_FLOW_CREDIT_PRICE_USD = 0.005;

export function assetCostUsd(model: string): number {
  const credits = GOOGLE_FLOW_CREDIT_COSTS[model] ?? 10;
  return credits * GOOGLE_FLOW_CREDIT_PRICE_USD;
}
