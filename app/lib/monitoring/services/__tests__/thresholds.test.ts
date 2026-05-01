import { describe, it, expect } from 'vitest';
import { computeStatus } from '../../thresholds';

describe('computeStatus', () => {
  describe('openrouter (warn<5, err<1 USD)', () => {
    it('ok at exact warning boundary 5.00', () => expect(computeStatus('openrouter', 5)).toBe('ok'));
    it('warning at 4.99', () => expect(computeStatus('openrouter', 4.99)).toBe('warning'));
    it('warning at exact error boundary 1.00', () => expect(computeStatus('openrouter', 1)).toBe('warning'));
    it('error at 0.99', () => expect(computeStatus('openrouter', 0.99)).toBe('error'));
    it('ok at 20', () => expect(computeStatus('openrouter', 20)).toBe('ok'));
  });

  describe('google-flow (warn<100, err<20 credits)', () => {
    it('ok at 100', () => expect(computeStatus('google-flow', 100)).toBe('ok'));
    it('warning at 99', () => expect(computeStatus('google-flow', 99)).toBe('warning'));
    it('warning at 20', () => expect(computeStatus('google-flow', 20)).toBe('warning'));
    it('error at 19', () => expect(computeStatus('google-flow', 19)).toBe('error'));
  });

  describe('capsolver (warn<3, err<0.5 USD)', () => {
    it('ok at 3', () => expect(computeStatus('capsolver', 3)).toBe('ok'));
    it('warning at 2.99', () => expect(computeStatus('capsolver', 2.99)).toBe('warning'));
    it('warning at 0.5', () => expect(computeStatus('capsolver', 0.5)).toBe('warning'));
    it('error at 0.49', () => expect(computeStatus('capsolver', 0.49)).toBe('error'));
  });

  describe('useapi (warn<80%, no error threshold)', () => {
    it('ok at 80', () => expect(computeStatus('useapi', 80)).toBe('ok'));
    it('warning at 79.9', () => expect(computeStatus('useapi', 79.9)).toBe('warning'));
    it('ok when null', () => expect(computeStatus('useapi', null)).toBe('ok'));
  });

  it('null value → ok for any service', () => {
    expect(computeStatus('openrouter', null)).toBe('ok');
  });
});
