/**
 * Image Optimizer - Convert images to base64 for OpenAI Vision API
 * More reliable than URLs (no timeout issues)
 * Compresses first to minimize base64 size
 */

import sharp from 'sharp';

const MAX_IMAGE_SIZE = 1024;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB after compression
const MAX_BASE64_SIZE = 1.5 * 1024 * 1024; // 1.5MB base64 string (~1MB binary)
const QUALITY = 85;

/**
 * Convert image URL to base64 data URI
 * Compresses image first to minimize base64 size
 */
export async function imageUrlToBase64(imageUrl: string): Promise<string> {
  try {
    console.log(`   🔄 Converting image to base64...`);
    
    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);
    const originalSize = originalBuffer.length;
    
    console.log(`   📥 Downloaded: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);

    // Compress with sharp first (to minimize base64 size)
    let compressedBuffer: Buffer;
    
    try {
      const metadata = await sharp(originalBuffer).metadata();
      const { width = 0, height = 0 } = metadata;
      
      console.log(`   📐 Dimensions: ${width}x${height}`);

      let sharpImage = sharp(originalBuffer);
      
      // Resize if needed
      if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
        sharpImage = sharpImage.resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, {
          fit: 'inside',
          withoutEnlargement: true,
        });
        console.log(`   🔧 Resizing to max ${MAX_IMAGE_SIZE}x${MAX_IMAGE_SIZE}`);
      }

      // Compress to JPEG
      compressedBuffer = await sharpImage
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toBuffer();

      const compressedSize = compressedBuffer.length;
      const savings = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
      
      console.log(`   ✅ Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)} MB (${savings}% smaller)`);

      // If still too large, reduce quality
      if (compressedSize > MAX_FILE_SIZE) {
        console.log(`   ⚠️  Still large, reducing quality...`);
        compressedBuffer = await sharp(originalBuffer)
          .resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 70, mozjpeg: true })
          .toBuffer();
        
        const finalSize = compressedBuffer.length;
        console.log(`   ✅ Final compressed: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
      }
    } catch (error) {
      console.error('   ❌ Sharp processing failed, using original:', error);
      compressedBuffer = originalBuffer; // Fallback to original
    }

    // Convert to base64
    const base64String = compressedBuffer.toString('base64');
    const base64Size = base64String.length;
    const base64SizeMB = (base64Size / 1024 / 1024).toFixed(2);
    
    console.log(`   ✅ Base64 size: ${base64SizeMB} MB`);
    
    if (base64Size > MAX_BASE64_SIZE) {
      console.warn(`   ⚠️  Base64 size (${base64SizeMB} MB) exceeds recommended limit (1.5 MB)`);
      console.warn(`   → Will try anyway, but may hit OpenAI message size limits`);
    }

    // Return data URI
    return `data:image/jpeg;base64,${base64String}`;
  } catch (error) {
    console.error('❌ Image to base64 conversion failed:', error);
    throw new Error(`Failed to convert image to base64: ${error instanceof Error ? error.message : String(error)}`);
  }
}
