#!/usr/bin/env tsx
// Remove unnecessary Redis config from .env.local
// Usage: npx tsx scripts/cleanup-env.ts

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  console.log('🧹 IdeaMill - Cleanup .env.local\n');

  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    console.log('❌ File .env.local tidak ditemukan!');
    console.log('   Buat dulu dengan: npx tsx scripts/setup-env.ts\n');
    return;
  }

  let content = fs.readFileSync(envPath, 'utf-8');
  const originalContent = content;

  // Remove Redis-related lines
  const linesToRemove = [
    /^REDIS_URL=.*$/gm,
    /^QUEUE_CONCURRENCY=.*$/gm,
    /^#.*Redis.*$/gm,
  ];

  linesToRemove.forEach((pattern) => {
    content = content.replace(pattern, '');
  });

  // Clean up multiple empty lines
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content === originalContent) {
    console.log('✅ File .env.local sudah bersih! Tidak ada Redis config.\n');
    return;
  }

  // Backup original
  const backupPath = envPath + '.backup';
  fs.writeFileSync(backupPath, originalContent);
  console.log('💾 Backup dibuat:', backupPath);

  // Write cleaned content
  fs.writeFileSync(envPath, content);
  console.log('✅ Redis config berhasil dihapus dari .env.local\n');
  console.log('📝 Perubahan:');
  console.log('   - REDIS_URL dihapus');
  console.log('   - QUEUE_CONCURRENCY dihapus');
  console.log('   - Komentar Redis dihapus\n');
  console.log('🎉 Queue sekarang berjalan 100% di Supabase (PostgreSQL)!\n');
}

main().catch(console.error);

