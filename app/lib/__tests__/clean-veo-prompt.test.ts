import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub MONGODB_URI before any module that reads it at import time
vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test');

vi.mock('../llm/client', () => ({
  chatCompletion: vi.fn(),
}));

// Bypass rate limiter (needs real DB) — execute fn directly
vi.mock('../llm/rateLimiter', () => ({
  acquireToken: vi.fn().mockResolvedValue(undefined),
  releaseToken: vi.fn().mockResolvedValue(undefined),
}));

import { chatCompletion } from '../llm/client';
const mockChat = vi.mocked(chatCompletion);

describe('cleanVeoPrompt', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns cleaned prompt dari LLM response', async () => {
    mockChat.mockResolvedValueOnce({
      choices: [{ message: { content: 'Indonesian woman sits on sofa, speaks: "Kulitku kusam? Sekarang bye-bye!" Static camera.' }, finish_reason: 'stop' }],
      model: 'google/gemini-2.5-flash',
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    } as any);

    const { cleanVeoPrompt } = await import('../llm/index');
    const result = await cleanVeoPrompt(
      'Model wanita duduk santai di sofa, berkata: "Kulitku kusam? Sekarang bye-bye!" Kamera statis.'
    );

    expect(result).toBe('Indonesian woman sits on sofa, speaks: "Kulitku kusam? Sekarang bye-bye!" Static camera.');
    expect(mockChat).toHaveBeenCalledOnce();
  });

  it('throw LLMError jika response kosong', async () => {
    mockChat.mockResolvedValueOnce({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }],
      model: 'google/gemini-2.5-flash',
      usage: { prompt_tokens: 100, completion_tokens: 0 },
    } as any);

    const { cleanVeoPrompt } = await import('../llm/index');
    await expect(cleanVeoPrompt('some prompt')).rejects.toThrow('Empty cleaned prompt');
  });

  it('menggunakan model google/gemini-2.5-flash', async () => {
    mockChat.mockResolvedValueOnce({
      choices: [{ message: { content: 'Clean prompt result.' }, finish_reason: 'stop' }],
      model: 'google/gemini-2.5-flash',
      usage: { prompt_tokens: 80, completion_tokens: 30 },
    } as any);

    const { cleanVeoPrompt } = await import('../llm/index');
    await cleanVeoPrompt('raw prompt');

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'google/gemini-2.5-flash' }),
      30_000
    );
  });
});
