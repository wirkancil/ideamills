# Google Flow Cookie Refresh — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tambah tab Settings di halaman monitoring untuk update cookies Google Flow dan email akun tanpa SSH ke server.

**Architecture:** API route forward cookies ke useapi.net, email disimpan di MongoDB Settings collection, useapi.ts baca email dari DB dengan fallback ke env.

**Tech Stack:** Next.js API routes, MongoDB, useapi.net REST API

---

## Komponen

### 1. `app/lib/settings.ts` (baru)
Helper baca/tulis key-value ke MongoDB collection `Settings`.

```typescript
// getSetting(key) → string | null
// setSetting(key, value) → void
```

Collection schema: `{ key: string, value: string, updated_at: Date }`
Index unik pada `key`.

### 2. `POST /api/admin/update-google-flow` (baru)
Request body:
```json
{ "cookies": "<isi .cookies.txt>", "email": "optional@email.com" }
```

Flow:
1. Validasi `cookies` tidak kosong (min 10 karakter)
2. Jika `email` ada, simpan ke MongoDB `Settings` key `google_flow_email`
3. POST ke `https://api.useapi.net/v1/google-flow/accounts` dengan body `{ cookies, email? }`
   - Header: `Authorization: Bearer ${USEAPI_TOKEN}`
4. Return response dari useapi.net as-is (status + body)

Error handling:
- Cookies kosong → 400
- useapi.net error → forward status + pesan error

### 3. `SettingsTab` di `app/monitoring/page.tsx`
UI elements:
- **Email field**: input text, pre-filled dari DB (`google_flow_email`) atau env (`USEAPI_GOOGLE_EMAIL`). Load saat tab dibuka.
- **Cookies textarea**: besar (8 baris), placeholder "Paste isi .cookies.txt di sini", kosong saat dibuka (tidak disimpan).
- **Tombol "Simpan & Refresh"**: disabled saat loading, loading spinner saat proses.
- **Result area**: muncul setelah submit — tampilkan health status dari useapi.net jika sukses, atau pesan error jika gagal.

Tab label: "Settings" — ditambah sejajar dengan "Status" dan "History".

### 4. Update `app/lib/useapi.ts`
Fungsi `getGoogleEmail()` baru:
```typescript
async function getGoogleEmail(override?: string): Promise<string> {
  if (override) return override;
  const fromDb = await getSetting('google_flow_email');
  if (fromDb) return fromDb;
  const fromEnv = process.env.USEAPI_GOOGLE_EMAIL;
  if (!fromEnv) throw new Error('USEAPI_GOOGLE_EMAIL not set');
  return fromEnv;
}
```

Semua fungsi yang pakai `process.env.USEAPI_GOOGLE_EMAIL` langsung diganti dengan `await getGoogleEmail(opts.email)`.

## Data Flow

```
User paste cookies + email → POST /api/admin/update-google-flow
  → simpan email ke MongoDB Settings
  → POST useapi.net /v1/google-flow/accounts { cookies, email }
  → return { health, error? } ke UI
  → tampilkan hasil di SettingsTab
```

## Load Email Saat Tab Dibuka

GET `/api/admin/update-google-flow` → return `{ email: string }` dari DB atau env.

## Out of Scope
- Auth/password untuk halaman settings
- Simpan cookies di DB (cookies tidak disimpan, langsung forward)
- Multi-akun Google Flow
