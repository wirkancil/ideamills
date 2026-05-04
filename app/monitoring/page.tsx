'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/app/components/TopBar';
import { RefreshCw, AlertCircle, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { MonitoringSnapshot, HistorySnapshot, ServiceMetric, GenerationCostRow } from '@/app/lib/monitoring/types';
import { SERVICE_LABELS } from '@/app/lib/monitoring/types';

// ─── Status Tab ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ServiceMetric['status'] }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  return <AlertCircle className="w-4 h-4 text-red-500" />;
}

function ServiceRow({ metric }: { metric: ServiceMetric }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <StatusBadge status={metric.status} />
        <div>
          <span className="font-medium text-sm">{SERVICE_LABELS[metric.service]}</span>
          {metric.detail && (
            <p className="text-xs text-muted-foreground mt-0.5">{metric.detail}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {metric.error ? (
          <span className="text-xs text-red-500">{metric.error}</span>
        ) : (
          <div className="text-right">
            <span className="text-sm font-semibold font-mono">{metric.display}</span>
            {metric.unit && (
              <p className="text-xs text-muted-foreground">
                {metric.unit === 'usd' ? 'tersisa' : metric.unit === 'credits' ? 'tersisa' : metric.unit}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTab() {
  const [snap, setSnap] = useState<MonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/monitoring${force ? '?force=1' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnap(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const cachedAt = snap?.cachedAt ? new Date(snap.cachedAt).toLocaleTimeString('id-ID') : null;
  const generatedAt = snap?.generatedAt ? new Date(snap.generatedAt).toLocaleTimeString('id-ID') : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-muted-foreground">
          {cachedAt ? `Cache dari ${cachedAt}` : generatedAt ? `Diperbarui ${generatedAt}` : ''}
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>
      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-600 text-sm mb-4">{error}</div>
      )}
      {snap ? (
        <div className="rounded-lg border bg-card divide-y divide-border overflow-hidden">
          {snap.services.map((m) => (
            <ServiceRow key={m.service} metric={m} />
          ))}
        </div>
      ) : !loading && (
        <div className="text-sm text-muted-foreground text-center py-8">Belum ada data</div>
      )}
    </div>
  );
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function formatIdr(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function SourceBadge({ source }: { source: GenerationCostRow['source'] }) {
  if (source === 'quick') return (
    <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Quick</span>
  );
  if (source === 'studio') return (
    <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Studio</span>
  );
  return null;
}

function HistoryRow({ row }: { row: GenerationCostRow }) {
  const date = new Date(row.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  const time = new Date(row.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
        {date} {time}
      </td>
      <td className="py-2.5 px-3"><SourceBadge source={row.source} /></td>
      <td className="py-2.5 px-3 text-sm max-w-[160px] truncate">{row.productIdentifier}</td>
      <td className="py-2.5 px-3 text-xs text-center">{row.clipCount}</td>
      <td className="py-2.5 px-3 text-xs text-right font-mono text-muted-foreground">
        ${row.llmCostUsd.toFixed(4)}
      </td>
      <td className="py-2.5 px-3 text-xs text-right font-mono text-muted-foreground">
        {row.assetCostUsd > 0 ? `$${row.assetCostUsd.toFixed(4)}` : '—'}
      </td>
      <td className="py-2.5 px-3 text-sm text-right font-semibold">{formatIdr(row.totalCostIdr)}</td>
      <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">
        {row.clipCount > 0 ? formatIdr(row.costPerClipIdr) : '—'}
      </td>
    </tr>
  );
}

function HistoryTab() {
  const [snap, setSnap] = useState<HistorySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/monitoring/history');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnap(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-muted-foreground">
          {snap && (
            <>Kurs: 1 USD = {new Intl.NumberFormat('id-ID').format(snap.exchangeRate.usdToIdr)} IDR
            {' · '}Data per {snap.exchangeRate.updatedAt} (forex terakhir)</>

          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>
      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-600 text-sm mb-4">{error}</div>
      )}
      {snap && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <SummaryCard label="Hari Ini" value={formatIdr(snap.summary.todayIdr)} />
            <SummaryCard label="7 Hari Terakhir" value={formatIdr(snap.summary.sevenDaysIdr)} />
            <SummaryCard label="Semua Waktu" value={formatIdr(snap.summary.allTimeIdr)} />
          </div>
          {snap.rows.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">Belum ada data penggunaan</div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-xs text-muted-foreground">
                      <th className="py-2 px-3 text-left font-medium">Waktu</th>
                      <th className="py-2 px-3 text-left font-medium">Mode</th>
                      <th className="py-2 px-3 text-left font-medium">Produk</th>
                      <th className="py-2 px-3 text-center font-medium">Klip</th>
                      <th className="py-2 px-3 text-right font-medium">LLM (USD)</th>
                      <th className="py-2 px-3 text-right font-medium">Aset (USD)</th>
                      <th className="py-2 px-3 text-right font-medium">Total (IDR)</th>
                      <th className="py-2 px-3 text-right font-medium">/Klip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.rows.map((row) => (
                      <HistoryRow key={row.generationId} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {!snap && !loading && (
        <div className="text-sm text-muted-foreground text-center py-8">Belum ada data</div>
      )}
    </div>
  );
}

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
        const emailKey = email.trim();
        const health = (emailKey && data[emailKey]?.health) ?? data.health ?? 'Session diperbarui';
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
    <div className="space-y-4 max-w-2xl">
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

      <div className="rounded-md border p-3 space-y-2 text-xs text-muted-foreground bg-muted/40">
        <p className="font-medium text-foreground text-sm">Cara export cookies Google Flow:</p>
        <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
          <li>Install extension <span className="font-medium text-foreground">Cookie Editor</span> di Chrome/Edge</li>
          <li>Login ke akun Google yang dipakai untuk Google Flow di <span className="font-mono">labs.google/flow</span></li>
          <li>Klik icon Cookie Editor di toolbar browser</li>
          <li>Klik tombol <span className="font-medium text-foreground">Export</span> → pilih format <span className="font-medium text-foreground">Header String</span></li>
          <li>Paste hasilnya ke field di atas</li>
          <li>Isi email akun, lalu klik <span className="font-medium text-foreground">Simpan & Refresh Session</span></li>
        </ol>
        <p className="text-[11px]">⚠️ Lakukan setiap kali muncul error &quot;Failed to refresh session&quot; di halaman Status.</p>
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
          {result.ok
            ? <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
            : <AlertCircle className="w-4 h-4 inline mr-1.5" />}
          {result.message}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'status' | 'history' | 'settings';

export default function MonitoringPage() {
  const [tab, setTab] = useState<Tab>('status');

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="container mx-auto px-4 max-w-4xl py-8">
        <h1 className="text-2xl font-bold mb-6">Monitoring</h1>

        <div className="flex gap-1 mb-6 border-b">
          {(['status', 'history', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'status' ? 'Status' : t === 'history' ? 'Riwayat Biaya' : 'Settings'}
            </button>
          ))}
        </div>

        {tab === 'status' ? <StatusTab /> : tab === 'history' ? <HistoryTab /> : <SettingsTab />}
      </main>
    </div>
  );
}
