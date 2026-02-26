'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Eye, Clock, CheckCircle, XCircle, Loader2, Sparkles } from 'lucide-react';

interface Generation {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  product_identifier: string;
  engine: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
  overrides?: string;
}

interface GenerationHistoryProps {
  showBackToDashboard?: boolean;
}

export function GenerationHistory() {
  const router = useRouter();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to extract theme/idea from generation data
  const getGenerationTheme = (gen: Generation): string => {
    // Try to get from overrides first
    if (gen.overrides && typeof gen.overrides === 'string' && gen.overrides.length > 10) {
      const cleanText = gen.overrides.replace(/[^\w\s.,!?-]/g, '').trim();
      return cleanText.length > 80 ? cleanText.substring(0, 80) + '...' : cleanText;
    }

    // Create meaningful theme from ID and metadata
    const idPrefix = gen.id.substring(0, 8);
    const date = new Date(gen.created_at).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });

    // Generate creative theme based on ID pattern and flow type
    const themes = {
      enhanced: [
        `Kampanye Premium ${idPrefix}`,
        `Ide Kreatif ${idPrefix}`,
        `Konsep Branding ${idPrefix}`,
        `Strategi Marketing ${idPrefix}`,
        `Kampanye Digital ${idPrefix}`
      ],
      standard: [
        `Proyek ${idPrefix}`,
        `Kampanye ${idPrefix}`,
        `Ide ${idPrefix}`,
        `Konsep ${idPrefix}`,
        `Proyek Kreatif ${idPrefix}`
      ]
    };

    const isEnhanced = gen.product_identifier === 'enhanced-flow';
    const themeOptions = themes[isEnhanced ? 'enhanced' : 'standard'];

    // Use ID hash to deterministically select theme
    const hash = gen.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const themeIndex = hash % themeOptions.length;

    return `${themeOptions[themeIndex]} - ${date}`;
  };

  useEffect(() => {
    fetchGenerations();
  }, []);

  const fetchGenerations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/generations?limit=10');
      if (!response.ok) {
        throw new Error('Failed to fetch generations');
      }
      const data = await response.json();
      setGenerations(data.generations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load generations');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'queued':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Berhasil</Badge>;
      case 'processing':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">Sedang Diproses</Badge>;
      case 'failed':
        return <Badge variant="destructive">Gagal</Badge>;
      case 'queued':
        return <Badge variant="secondary">Dalam Antrian</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewGeneration = (id: string) => {
    router.push(`/generations/${id}`);
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Memuat riwayat kampanye...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-600 mb-2">Terjadi Kesalahan</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button
              variant="outline"
              onClick={fetchGenerations}
            >
              Muat Ulang
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (generations.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Sparkles className="w-12 h-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">Belum Ada Kampanye</h3>
          <p className="text-gray-500 text-center max-w-md">
            Anda belum membuat kampanye iklan apapun. Kunjungi halaman &quot;Buat Ide&quot; untuk memulai membuat kampanye pertama Anda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {generations.map((gen) => (
        <Card key={gen.id} className="w-full hover:shadow-md transition-shadow">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(gen.status)}
                <div className="flex-1">
                  <CardTitle className="text-lg leading-tight">
                    {getGenerationTheme(gen)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {gen.product_identifier === 'enhanced-flow' ? 'Flow Enhanced' : 'Flow Standard'} • {gen.engine === 'gpt-5.2' ? 'GPT-5.2' : gen.engine === 'gpt-4o' ? 'GPT-4o' : 'Gemini 2.5 Flash'}
                  </p>
                </div>
              </div>
              {getStatusBadge(gen.status)}
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-4">
              {/* Progress Bar */}
              {(gen.status === 'processing' || gen.status === 'completed') && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Progress</span>
                    <span>{gen.progress}%</span>
                  </div>
                  <Progress value={gen.progress} className="h-2" />
                </div>
              )}

              {/* Error Message */}
              {gen.status === 'failed' && gen.error_message && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">
                    <strong>Error:</strong> {gen.error_message}
                  </p>
                </div>
              )}

              {/* Dates */}
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Dibuat: {formatDate(gen.created_at)}</span>
                <span>Diupdate: {formatDate(gen.updated_at)}</span>
              </div>

              {/* Actions */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewGeneration(gen.id)}
                  className="flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Lihat Hasil
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {generations.length >= 10 && (
        <div className="text-center">
          <Button variant="outline" onClick={fetchGenerations}>
            Muat Lebih Banyak
          </Button>
        </div>
      )}
    </div>
  );
}
