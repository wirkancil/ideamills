# Google Flow Cookie Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah tab Settings di `/monitoring` untuk update cookies Google Flow dan email akun dari UI, tanpa SSH ke server.

**Architecture:** `app/lib/settings.ts` menyimpan email ke MongoDB. API route `/api/admin/update-google-flow` forward cookies ke useapi.net dan simpan email ke DB. `useapi.ts` baca email dari DB dengan fallback ke env. UI tab Settings di halaman monitoring.

**Tech Stack:** Next.js App Router, MongoDB, useapi.net REST API, React, TypeScript

---

## File Structure

| File | Action | Tanggung jawab |
|------|--------|----------------|
| `app/lib/settings.ts` | Create | getSetting / setSetting ke MongoDB collection `Settings` |
| `app/api/admin/update-google-flow/route.ts` | Create | POST: forward cookies ke useapi.net + simpan email. GET: baca email saat ini |
| `app/lib/useapi.ts` | Modify | Ganti `process.env.USEAPI_GOOGLE_EMAIL` langsung dengan helper yang baca DB |
| `app/monitoring/page.tsx` | Modify | Tambah tab Settings + SettingsTab component |

---

### Task 1: Settings helper (MongoDB key-value store)

**Files:**
- Create: `app/lib/settings.ts`

- [ ] **Step 1: Buat file `app/lib/settings.ts`**

```typescript
import { getDb } from './mongoClient';

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const doc = await db.collection('Settings').findOne({ key });
  return doc?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.collection('Settings').updateOne(
    { key },
    { $set: { key, value, updated_at: new Date() } },
    { upsert: true }
  );
}
```

- [ ] **Step 2: Verifikasi file bisa di-import tanpa error TypeScript**

```bash
cd /path/to/ideamills
npx tsc --noEmit 2>&1 | grep settings
```
Expected: tidak ada error

- [ ] **Step 3: Commit**

```bash
git add app/lib/settings.ts
git commit -m "feat: add settings helper for MongoDB key-value store"
```

---

### Task 2: API route update-google-flow

**Files:**
- Create: `app/api/admin/update-google-flow/route.ts`

- [ ] **Step 1: Buat file `app/api/admin/update-google-flow/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/app/lib/settings';

const USEAPI_BASE = 'https://api.useapi.net/v1';

export async function GET() {
  const fromDb = await getSetting('google_flow_email');
  const email = fromDb ?? process.env.USEAPI_GOOGLE_EMAIL ?? '';
  return NextResponse.json({ email });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cookies = (body.cookies as string | undefined)?.trim() ?? '';
  const email = (body.email as string | undefined)?.trim() ?? '';

  if (cookies.length < 10) {
    return NextResponse.json({ error: 'Cookies tidak boleh kosong' }, { status: 400 });
  }

  // Simpan email ke DB jika ada
  if (email) {
    await setSetting('google_flow_email', email);
  }

  // Forward cookies ke useapi.net
  const token = process.env.USEAPI_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'USEAPI_TOKEN tidak dikonfigurasi' }, { status: 500 });
  }

  const payload: Record<string, string> = { cookies };
  if (email) payload.email = email;

  const res = await fetch(`${USEAPI_BASE}/google-flow/accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Test GET endpoint**

```bash
curl http://localhost:3000/api/admin/update-google-flow
```
Expected: `{"email":"..."}` — isi dari env USEAPI_GOOGLE_EMAIL

- [ ] **Step 3: Test POST dengan cookies kosong**

```bash
curl -X POST http://localhost:3000/api/admin/update-google-flow \
  -H "Content-Type: application/json" \
  -d '{"cookies":""}'
```
Expected: `{"error":"Cookies tidak boleh kosong"}` dengan status 400

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/update-google-flow/route.ts
git commit -m "feat: add update-google-flow API route"
```

---

### Task 3: Update useapi.ts untuk baca email dari DB

**Files:**
- Modify: `app/lib/useapi.ts`

- [ ] **Step 1: Tambah fungsi `resolveEmail` di bagian atas `useapi.ts` (setelah `authHeader`)**

Tambahkan import dan fungsi setelah baris `function authHeader()...`:

```typescript
import { getSetting } from './settings';

async function resolveEmail(override?: string): Promise<string> {
  if (override) return override;
  const fromDb = await getSetting('google_flow_email');
  if (fromDb) return fromDb;
  const fromEnv = process.env.USEAPI_GOOGLE_EMAIL;
  if (!fromEnv) throw new Error('USEAPI_GOOGLE_EMAIL not set');
  return fromEnv;
}
```

- [ ] **Step 2: Update `uploadImageAsset` — ganti baris email**

Ganti:
```typescript
const userEmail = email ?? process.env.USEAPI_GOOGLE_EMAIL;
if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');
```

Dengan:
```typescript
const userEmail = await resolveEmail(email);
```

- [ ] **Step 3: Update `createVideoJob` — ganti baris email**

Ganti:
```typescript
const userEmail = opts.email ?? process.env.USEAPI_GOOGLE_EMAIL;
if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');
```

Dengan:
```typescript
const userEmail = await resolveEmail(opts.email);
```

- [ ] **Step 4: Update `generateImage` — ganti baris email**

Ganti:
```typescript
const userEmail = opts.email ?? process.env.USEAPI_GOOGLE_EMAIL;
if (!userEmail) throw new Error('USEAPI_GOOGLE_EMAIL not set');
```

Dengan:
```typescript
const userEmail = await resolveEmail(opts.email);
```

- [ ] **Step 5: Verifikasi TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep useapi
```
Expected: tidak ada error

- [ ] **Step 6: Commit**

```bash
git add app/lib/useapi.ts
git commit -m "feat: useapi resolveEmail reads from DB with env fallback"
```

---

### Task 4: Tab Settings di halaman monitoring

**Files:**
- Modify: `app/monitoring/page.tsx`

- [ ] **Step 1: Tambah type Tab dan SettingsTab component**

Di `app/monitoring/page.tsx`, tambah setelah `// ─── History Tab` section:

```typescript
// ─── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab() {
  const [email, setEmail] = useState('');
  const [cookies, setCookies] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/update-google-flow')
      .then((r) => r.json())
      .then((d) => { if (d.email) setEmail(d.email); })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!cookies.trim()) {
      setResult({ ok: false, message: 'Cookies tidak boleh kosong' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/update-google-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookies.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        const health = data[email.trim()]?.health ?? data.health ?? 'Session diperbarui';
        setResult({ ok: true, message: health });
        setCookies('');
      } else {
        setResult({ ok: false, message: data.error ?? `Error ${res.status}` });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Email Akun Google Flow</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="w-full text-sm border rounded-md px-3 py-2 bg-background"
        />
        <p className="text-xs text-muted-foreground">Email akun Google yang dipakai untuk Google Flow. Disimpan ke DB.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Cookies Google Flow</label>
        <textarea
          value={cookies}
          onChange={(e) => setCookies(e.target.value)}
          placeholder="Paste isi file .cookies.txt di sini..."
          rows={8}
          className="w-full text-xs font-mono border rounded-md px-3 py-2 bg-background resize-y"
        />
        <p className="text-xs text-muted-foreground">Export dari browser extension, paste seluruh isi file. Tidak disimpan — langsung dikirim ke useapi.net.</p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Simpan & Refresh Session
      </button>

      {result && (
        <div className={`p-3 rounded-md text-sm ${result.ok ? 'bg-green-500/10 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
          {result.ok ? <CheckCircle2 className="w-4 h-4 inline mr-1.5" /> : <AlertCircle className="w-4 h-4 inline mr-1.5" />}
          {result.message}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update type Tab dan render**

Ganti:
```typescript
type Tab = 'status' | 'history';
```
Dengan:
```typescript
type Tab = 'status' | 'history' | 'settings';
```

Ganti:
```typescript
{(['status', 'history'] as Tab[]).map((t) => (
```
Dengan:
```typescript
{(['status', 'history', 'settings'] as Tab[]).map((t) => (
```

Ganti label render (di dalam button):
```typescript
{t === 'status' ? 'Status' : t === 'history' ? 'History' : 'Settings'}
```

Ganti render konten tab (di bawah tab buttons):
```typescript
{tab === 'status' ? <StatusTab /> : tab === 'history' ? <HistoryTab /> : <SettingsTab />}
```

- [ ] **Step 3: Verifikasi TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep monitoring
```
Expected: tidak ada error

- [ ] **Step 4: Test manual di browser**

1. Buka `http://localhost:3000/monitoring`
2. Klik tab "Settings"
3. Verifikasi email field terisi dari env/DB
4. Paste cookies test (minimal 10 karakter) → klik "Simpan & Refresh Session"
5. Verifikasi response muncul (sukses atau error dari useapi.net)

- [ ] **Step 5: Commit**

```bash
git add app/monitoring/page.tsx
git commit -m "feat: add Settings tab to monitoring for Google Flow cookie refresh"
```
