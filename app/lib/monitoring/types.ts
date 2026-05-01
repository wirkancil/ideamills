export type ServiceName = 'openrouter' | 'google-flow' | 'capsolver' | 'useapi';
export type ServiceStatus = 'ok' | 'warning' | 'error';
export type ServiceUnit = 'usd' | 'credits' | 'requests' | null;

export interface ServiceMetric {
  service: ServiceName;
  status: ServiceStatus;
  display: string;
  value: number | null;
  unit: ServiceUnit;
  detail: string | null;
  error: string | null;
  latencyMs: number;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  cachedAt: string | null;
  services: ServiceMetric[];
}

export const SERVICE_ORDER: ServiceName[] = ['openrouter', 'google-flow', 'capsolver', 'useapi'];

export const SERVICE_LABELS: Record<ServiceName, string> = {
  'openrouter':  'OpenRouter',
  'google-flow': 'Google Flow',
  'capsolver':   'CapSolver',
  'useapi':      'useapi.net',
};

export interface AssetUsageEntry {
  generationId: string;
  clipIndex: number;
  service: 'veo' | 'imagen';
  model: string;
  creditCost: number;
  costUsd: number;
  createdAt: Date;
}

export interface GenerationCostRow {
  generationId: string;
  productIdentifier: string;
  source: 'quick' | 'studio' | null;
  createdAt: string;
  clipCount: number;
  llmCostUsd: number;
  assetCostUsd: number;
  totalCostUsd: number;
  totalCostIdr: number;
  costPerClipIdr: number;
}

export interface HistorySnapshot {
  rows: GenerationCostRow[];
  summary: {
    todayIdr: number;
    sevenDaysIdr: number;
    allTimeIdr: number;
  };
  exchangeRate: {
    usdToIdr: number;
    source: 'frankfurter.app';
    updatedAt: string;
  };
  generatedAt: string;
}
