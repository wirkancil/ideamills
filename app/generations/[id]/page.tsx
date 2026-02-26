'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { JobStatus } from '@/app/components/JobStatus';
import { ResultsDisplay } from '@/app/components/ResultsDisplay';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { ArrowLeft, RefreshCw, XCircle } from 'lucide-react';
import { GenerationStatus, Variation } from '@/app/lib/types';

export default function GenerationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  const router = useRouter();
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [page, setPage] = useState(1);
  const [totalVariations, setTotalVariations] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchGeneration = async () => {
    try {
      const response = await fetch(`/api/generations/${id}?page=${page}&pageSize=20`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API Error:', response.status, errorData);
        
        if (response.status === 404) {
          setStatus({
            id: id,
            status: 'failed',
            progress: 0,
            engine: 'gpt-5.2',
            counts: { themes: 0, scripts: 0, variations: 0 },
            error: 'Generation tidak ditemukan. Mungkin ID tidak valid atau generation sudah dihapus.',
            createdAt: new Date().toISOString(),
          });
        } else {
          setStatus({
            id: id,
            status: 'failed',
            progress: 0,
            engine: 'gpt-5.2',
            counts: { themes: 0, scripts: 0, variations: 0 },
            error: `Error ${response.status}: ${errorData.error || 'Gagal memuat generation'}`,
            createdAt: new Date().toISOString(),
          });
        }
        setVariations([]);
        setTotalVariations(0);
        setLoading(false);
        return;
      }

      let data;
      try {
        const text = await response.text();
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        const errorMessage = parseError instanceof Error ? parseError.message : 'Invalid JSON';
        console.error('Error details:', errorMessage);
        
        // Set error status
        setStatus({
          id: id,
          status: 'failed',
          progress: 0,
          engine: 'gpt-5.2',
          counts: { themes: 0, scripts: 0, variations: 0 },
          error: `Error parsing response: ${errorMessage}. Kemungkinan ada data yang corrupt di database.`,
          createdAt: new Date().toISOString(),
        });
        setVariations([]);
        setTotalVariations(0);
        setLoading(false);
        return;
      }

      setStatus({
        id: data.id,
        status: data.status,
        progress: data.progress,
        engine: data.engine,
        productIdentifier: data.productIdentifier,
        counts: data.counts,
        themeCounts: data.themeCounts,
        error: data.error,
        createdAt: data.createdAt,
      });

      if (page === 1) {
        setVariations(data.variations || []);
      } else {
        setVariations((prev) => [...prev, ...(data.variations || [])]);
      }

      setTotalVariations(data.totalVariations || 0);
      setLoading(false);
    } catch (error) {
      console.error('Fetch error:', error);
      setStatus({
        id: id,
        status: 'failed',
        progress: 0,
        engine: 'gpt-5.2',
        counts: { themes: 0, scripts: 0, variations: 0 },
        error: `Network error: ${error instanceof Error ? error.message : 'Gagal menghubungi server'}`,
        createdAt: new Date().toISOString(),
      });
      setVariations([]);
      setTotalVariations(0);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, page]);

  // Real-time polling - poll every 2 seconds if processing
  useEffect(() => {
    // Don't poll if status is completed/failed/canceled or loading
    if (loading) return;
    
    const isActive = status?.status === 'queued' || 
                     status?.status === 'processing' || 
                     status?.status === 'running';
    
    if (!isActive) return;

    const interval = setInterval(() => {
      fetchGeneration();
    }, 2000); // Poll every 2 seconds for real-time updates

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status?.status, loading]);

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  const handleRetry = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/generations/${id}/retry`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to retry generation');
      }
      
      // Reload page data
      await fetchGeneration();
    } catch (err) {
      console.error('Retry failed:', err);
      alert(`Gagal mencoba ulang: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Memuat generasi...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => router.push('/history')}
        className="mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Kembali ke Riwayat
      </Button>

      {/* Status Card */}
      <div className="mb-8">
        {status && <JobStatus status={status} />}
      </div>

      {/* Results */}
      {variations.length > 0 && (
        <ResultsDisplay
          variations={variations}
          totalCount={totalVariations}
          themeCounts={status?.themeCounts}
          onLoadMore={variations.length < totalVariations ? handleLoadMore : undefined}
          hasMore={variations.length < totalVariations}
          generationId={id}
        />
      )}

      {/* Empty State */}
      {status?.status === 'succeeded' && variations.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Tidak ada variasi yang dihasilkan.</p>
        </div>
      )}

      {/* Error State - Show when generation failed */}
      {status && status.status === 'failed' && status.error && variations.length === 0 && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <XCircle className="w-16 h-16 text-destructive mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-destructive mb-2">
                  {status.error.includes('tidak ditemukan') ? 'Generation Tidak Ditemukan' : 'Gagal Generate'}
                </h3>
                <p className="text-muted-foreground">
                  {status.error}
                </p>
              </div>
              <div className="pt-4 flex justify-center gap-4">
                <Button onClick={() => router.push('/history')} variant="outline">
                  Kembali ke Riwayat
                </Button>
                <Button onClick={handleRetry}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Coba Generate Ulang
                </Button>
              </div>
              {/* Debug info */}
              <div className="pt-2">
                 <p className="text-xs text-muted-foreground">
                  Generation ID: <code className="bg-muted px-2 py-1 rounded">{id}</code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

