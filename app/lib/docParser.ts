/**
 * Doc parser — extract plain text from .docx, .txt, .md buffers.
 * Pure utility, no LLM calls.
 */

const SUPPORTED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);

export class DocParseError extends Error {
  constructor(message: string, public readonly code: 'UNSUPPORTED_MIME' | 'CORRUPT' | 'EMPTY') {
    super(message);
    this.name = 'DocParseError';
  }
}

export function isSupportedMime(mime: string): boolean {
  return SUPPORTED_MIMES.has(mime);
}

export async function extractText(buffer: Buffer, mime: string): Promise<string> {
  if (!isSupportedMime(mime)) {
    throw new DocParseError(`Unsupported MIME type: ${mime}`, 'UNSUPPORTED_MIME');
  }

  // Minimal type stub — mammoth ships no .d.ts and there's no @types/mammoth package
  interface MammothResult { value: string; messages: unknown[] }
  interface MammothModule {
    extractRawText(options: { buffer: Buffer }): Promise<MammothResult>;
  }

  let text: string;
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const mammoth = (await import('mammoth')) as unknown as MammothModule;
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch (err) {
      throw new DocParseError(
        `Failed to extract text from .docx: ${(err as Error).message}`,
        'CORRUPT'
      );
    }
  } else {
    // Buffer.toString('utf-8') never throws — invalid bytes become U+FFFD silently.
    // Binary detection is intentionally not performed for text/* MIMEs; the EMPTY
    // check below catches the only remaining failure mode (zero-length result).
    text = buffer.toString('utf-8');
  }

  text = text.trim();
  if (text.length === 0) {
    throw new DocParseError('No text could be extracted from file', 'EMPTY');
  }

  return text;
}
