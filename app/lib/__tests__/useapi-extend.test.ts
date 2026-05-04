import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.stubEnv('USEAPI_TOKEN', 'test-token');
vi.stubEnv('USEAPI_GOOGLE_EMAIL', 'test@example.com');

describe('extendVideo', () => {
  beforeEach(() => vi.resetAllMocks());

  it('calls /google-flow/videos/extend dengan mediaGenerationId dan prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobid: 'job-ext-123' }),
    });

    const { extendVideo } = await import('../useapi');
    const jobId = await extendVideo({
      mediaGenerationId: 'media-abc',
      prompt: 'Camera pans right',
    });

    expect(jobId).toBe('job-ext-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.useapi.net/v1/google-flow/videos/extend',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"mediaGenerationId":"media-abc"'),
      })
    );
  });

  it('throw error jika response tidak ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    });

    const { extendVideo } = await import('../useapi');
    await expect(extendVideo({ mediaGenerationId: 'x', prompt: 'y' })).rejects.toThrow('useapi.net 400');
  });
});

describe('concatenateVideos', () => {
  beforeEach(() => vi.resetAllMocks());

  it('calls /google-flow/videos/concatenate dan returns base64', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: 'concat-job-1',
        status: 'MEDIA_GENERATION_STATUS_SUCCESSFUL',
        inputsCount: 2,
        encodedVideo: 'base64videocontent',
      }),
    });

    const { concatenateVideos } = await import('../useapi');
    const result = await concatenateVideos([
      { mediaGenerationId: 'media-1' },
      { mediaGenerationId: 'media-2', trimStart: 1 },
    ]);

    expect(result.encodedVideo).toBe('base64videocontent');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.useapi.net/v1/google-flow/videos/concatenate',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
