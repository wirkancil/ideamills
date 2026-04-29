import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import sharp from 'sharp';
import { Readable } from 'stream';
import { GridFSBucket } from 'mongodb';

// Raise the body size limit for this route — multipart uploads can be 5–10 MB
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const MAX_IMAGE_SIZE = 1024; // Max width/height in pixels
const MAX_FILE_SIZE = 1024 * 1024; // Max 1MB after compression
const QUALITY = 85; // JPEG quality (85 is good balance)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Convert to buffer
    const bytes = await file.arrayBuffer();
    const originalBuffer = Buffer.from(bytes);

    // Compress and resize image using sharp
    let processedBuffer: Buffer;

    try {
      let sharpImage = sharp(originalBuffer);
      const metadata = await sharpImage.metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      if (originalWidth > MAX_IMAGE_SIZE || originalHeight > MAX_IMAGE_SIZE) {
        sharpImage = sharpImage.resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      processedBuffer = await sharpImage.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();

      if (processedBuffer.length > MAX_FILE_SIZE) {
        processedBuffer = await sharp(originalBuffer)
          .resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70, mozjpeg: true })
          .toBuffer();
      }
    } catch {
      processedBuffer = originalBuffer;
    }

    // Generate unique filename (always use .jpg for consistency)
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    const db = await getDb();
    const bucket = new GridFSBucket(db, { bucketName: process.env.MONGODB_BUCKET || 'images' });
    const uploadStream = bucket.openUploadStream(fileName, { contentType: 'image/jpeg' });
    await new Promise<void>((resolve, reject) => {
      Readable.from(processedBuffer).pipe(uploadStream).on('error', reject).on('finish', () => resolve());
    });
    const id = uploadStream.id?.toString();
    const base = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    const url = `${base}/api/images/${id}`;
    return NextResponse.json({ url, path: id });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
