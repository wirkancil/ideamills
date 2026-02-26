'use client';

import { TopBar } from '../components/TopBar';
import { InputForm } from '../components/InputForm';
import { Sparkles, Lightbulb, Target, Wand2 } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <TopBar />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sparkles className="w-10 h-10 text-primary" />
            <h1 className="text-4xl font-bold">Pusat Kreasi Ide</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transformasikan konsep produk Anda menjadi kampanye iklan yang powerful dan menginspirasi
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12 max-w-4xl mx-auto">
          <div className="text-center p-6 bg-white/70 backdrop-blur rounded-lg border">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Lightbulb className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold mb-2">Ide Kreatif</h3>
            <p className="text-sm text-muted-foreground">
              Generate berbagai variasi ide kampanye yang unik dan menarik
            </p>
          </div>

          <div className="text-center p-6 bg-white/70 backdrop-blur rounded-lg border">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Target className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold mb-2">Targeting Tepat</h3>
            <p className="text-sm text-muted-foreground">
              Konten yang disesuaikan dengan audiens target Anda
            </p>
          </div>

          <div className="text-center p-6 bg-white/70 backdrop-blur rounded-lg border">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Wand2 className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold mb-2">Siap Produksi</h3>
            <p className="text-sm text-muted-foreground">
              Output lengkap dengan storyboard dan prompt visual
            </p>
          </div>
        </div>

        {/* Input Form Section */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Mulai Buat Kampanye Anda</h2>
            <p className="text-muted-foreground">
              Upload gambar produk dan berikan deskripsi untuk menghasilkan ide kreatif
            </p>
          </div>
          <InputForm />
        </div>
      </div>
    </div>
  );
}
