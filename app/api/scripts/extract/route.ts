import { NextRequest, NextResponse } from 'next/server';
import { extractText, isSupportedMime, DocParseError } from '@/app/lib/docParser';

const FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const CONTENT_MAX = 5000;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type harus multipart/form-data' },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (file.size > FILE_MAX_BYTES) {
      return NextResponse.json({ error: 'File terlalu besar (max 5MB)' }, { status: 400 });
    }
    if (!isSupportedMime(file.type)) {
      return NextResponse.json(
        { error: 'Format file tidak didukung. Gunakan .docx, .txt, atau .md' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;
    try {
      text = await extractText(buffer, file.type);
    } catch (err) {
      if (err instanceof DocParseError) {
        if (err.code === 'CORRUPT') {
          return NextResponse.json({ error: 'File rusak atau tidak valid' }, { status: 400 });
        }
        if (err.code === 'EMPTY') {
          return NextResponse.json(
            { error: 'Tidak ada teks yang bisa diekstrak dari file' },
            { status: 400 }
          );
        }
      }
      throw err;
    }

    let warning: string | undefined;
    if (text.length > CONTENT_MAX) {
      text = text.slice(0, CONTENT_MAX);
      warning = `Teks di-truncate ke ${CONTENT_MAX} karakter pertama.`;
    }

    return NextResponse.json({ content: text, warning });
  } catch (err) {
    console.error('[POST /api/scripts/extract] error:', err);
    return NextResponse.json({ error: 'Server error. Coba lagi.' }, { status: 500 });
  }
}
