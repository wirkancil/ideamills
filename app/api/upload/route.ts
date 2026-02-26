import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import sharp from 'sharp';
import { Readable } from 'stream';
import { GridFSBucket } from 'mongodb';

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
    const originalSize = originalBuffer.length;

    console.log(`📸 Original image: ${(originalSize / 1024 / 1024).toFixed(2)} MB, type: ${file.type}`);

    // Compress and resize image using sharp
    let processedBuffer: Buffer;
    let contentType = 'image/jpeg'; // Default to JPEG for better compression
    
    try {
      let sharpImage = sharp(originalBuffer);
      
      // Get image metadata
      const metadata = await sharpImage.metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;
      
      console.log(`   Dimensions: ${originalWidth}x${originalHeight}`);

      // Resize if too large (maintain aspect ratio)
      if (originalWidth > MAX_IMAGE_SIZE || originalHeight > MAX_IMAGE_SIZE) {
        sharpImage = sharpImage.resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, {
          fit: 'inside',
          withoutEnlargement: true,
        });
        console.log(`   ✅ Resizing to max ${MAX_IMAGE_SIZE}x${MAX_IMAGE_SIZE}`);
      }

      // Convert to JPEG and compress (better compression than PNG)
      processedBuffer = await sharpImage
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toBuffer();

      const processedSize = processedBuffer.length;
      const savings = ((originalSize - processedSize) / originalSize * 100).toFixed(1);
      
      console.log(`   ✅ Compressed: ${(processedSize / 1024 / 1024).toFixed(2)} MB (${savings}% smaller)`);

      // If still too large, reduce quality further
      if (processedSize > MAX_FILE_SIZE) {
        console.log(`   ⚠️  Still too large, reducing quality...`);
        processedBuffer = await sharp(originalBuffer)
          .resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 70, mozjpeg: true })
          .toBuffer();
        
        const finalSize = processedBuffer.length;
        const finalSavings = ((originalSize - finalSize) / originalSize * 100).toFixed(1);
        console.log(`   ✅ Final: ${(finalSize / 1024 / 1024).toFixed(2)} MB (${finalSavings}% smaller)`);
      }
    } catch (error) {
      console.error('❌ Image processing error:', error);
      // Fallback to original if sharp fails
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
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
