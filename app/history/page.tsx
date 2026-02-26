'use client';

import { TopBar } from '../components/TopBar';
import { GenerationHistory } from '../components/GenerationHistory';
import { History, Sparkles } from 'lucide-react';

export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <TopBar />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <History className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">Riwayat Generasi Ide</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Pantau dan kelola semua generasi ide kreatif yang telah Anda buat
          </p>
        </div>

        {/* Generation History */}
        <GenerationHistory />
      </div>
    </div>
  );
}
