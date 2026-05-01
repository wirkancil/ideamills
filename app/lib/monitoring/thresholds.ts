import type { ServiceName, ServiceStatus } from './types';

interface Threshold {
  warningBelow: number;
  errorBelow: number | null;
}

const THRESHOLDS: Record<ServiceName, Threshold> = {
  'openrouter':  { warningBelow: 5,   errorBelow: 1    },
  'google-flow': { warningBelow: 100, errorBelow: 20   },
  'capsolver':   { warningBelow: 3,   errorBelow: 0.5  },
  'useapi':      { warningBelow: 80,  errorBelow: null },
};

export function computeStatus(service: ServiceName, value: number | null): ServiceStatus {
  if (value === null) return 'ok';
  const t = THRESHOLDS[service];
  if (t.errorBelow !== null && value < t.errorBelow) return 'error';
  if (value < t.warningBelow) return 'warning';
  return 'ok';
}
