#!/usr/bin/env tsx
/**
 * Update useapi.net Google Flow account cookies via API.
 *
 * Usage:
 *   1. Login ke akun Google Flow di browser
 *   2. Ekstrak cookies via DevTools → Application → Cookies → google.com
 *      Copy seluruh tabel dengan format tab-separated (Name, Value, Domain, Path, Expires, ...)
 *   3. Paste ke file `.cookies.txt` di root project (file ini sudah di-gitignore)
 *   4. Run: npx tsx scripts/update-useapi-cookies.ts
 *
 * File `.cookies.txt` HARUS berisi cookies tab-separated, satu cookie per baris.
 * Setelah berhasil, hapus file `.cookies.txt` (kebiasaan baik — jangan biarkan tersimpan).
 *
 * Endpoint: POST https://api.useapi.net/v1/google-flow/accounts
 * Docs: https://useapi.net/docs/api-google-flow-v1/post-google-flow-accounts
 */

import './env';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_FILE = path.join(process.cwd(), '.cookies.txt');
const ENDPOINT = 'https://api.useapi.net/v1/google-flow/accounts';

async function main() {
  const token = process.env.USEAPI_TOKEN;
  if (!token) {
    console.error('❌ USEAPI_TOKEN tidak ditemukan di .env.local');
    process.exit(1);
  }

  if (!fs.existsSync(COOKIES_FILE)) {
    console.error(`❌ File ${COOKIES_FILE} tidak ditemukan.`);
    console.error('   Buat file dulu, paste cookies dari DevTools (tab-separated), save.');
    process.exit(1);
  }

  const cookies = fs.readFileSync(COOKIES_FILE, 'utf-8').trim();
  if (!cookies || cookies.length < 100) {
    console.error('❌ File .cookies.txt kosong atau terlalu pendek.');
    process.exit(1);
  }

  console.log(`📤 Mengirim cookies ke useapi.net (${cookies.length} chars)...`);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cookies }),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (res.ok) {
    console.log(`✅ Berhasil — HTTP ${res.status}`);
    const r = parsed as { email?: string; nextRefresh?: string; project?: { id?: string; title?: string } };
    if (r.email) console.log(`📧 Email: ${r.email}`);
    if (r.project) console.log(`📁 Project: ${r.project.title ?? '(no title)'} (id: ${r.project.id ?? '?'})`);
    if (r.nextRefresh) {
      const nextRefreshDate = new Date(r.nextRefresh);
      const now = new Date();
      const diffMs = nextRefreshDate.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / 60_000);
      console.log(`🔄 Next refresh: ${r.nextRefresh} (~${diffMins} menit dari sekarang)`);
      console.log('   useapi.net akan auto-refresh cookie sebelum expire — tidak perlu manual update.');
    }
    console.log('');
    console.log('💡 Hapus file .cookies.txt sekarang untuk keamanan.');
  } else {
    console.error(`❌ Gagal — HTTP ${res.status}`);
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Script error:', err);
  process.exit(1);
});
