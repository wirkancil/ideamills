import { TopBar } from './components/TopBar';
import { Sparkles, Zap, Target, Lightbulb } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <TopBar />

      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Sparkles className="w-16 h-16 text-primary" />
            <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              IdeaMill
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Platform kecerdasan buatan terdepan untuk menghasilkan <span className="font-semibold text-primary">100+ variasi konten iklan</span>
            {' '}yang siap produksi dalam hitungan menit
          </p>
          <div className="flex justify-center">
            <div className="bg-white/80 backdrop-blur-sm rounded-full px-6 py-2 text-sm text-muted-foreground border">
              ✨ Powered by GPT-4o & Gemini 1.5 Pro
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16 max-w-5xl mx-auto">
          <div className="text-center p-8 bg-white/70 backdrop-blur rounded-xl border border-white/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3">Performa Tinggi</h3>
            <p className="text-muted-foreground">
              Hasilkan ratusan variasi konten dalam 2-8 menit menggunakan model AI terdepan
            </p>
          </div>

          <div className="text-center p-8 bg-white/70 backdrop-blur rounded-xl border border-white/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3">Kualitas Premium</h3>
            <p className="text-muted-foreground">
              Teknologi deduplikasi cerdas memastikan setiap ide unik dan bernilai tinggi
            </p>
          </div>

          <div className="text-center p-8 bg-white/70 backdrop-blur rounded-xl border border-white/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lightbulb className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3">Siap Produksi</h3>
            <p className="text-muted-foreground">
              Output lengkap dengan skrip narasi, prompt visual, dan metadata untuk pipeline produksi
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <div className="bg-white/60 backdrop-blur rounded-2xl p-8 max-w-2xl mx-auto border border-white/50">
            <h2 className="text-2xl font-bold mb-4">Mulai Buat Ide Kreatif Anda</h2>
            <p className="text-muted-foreground mb-6">
              Transformasikan konsep produk Anda menjadi kampanye iklan yang menginspirasi
            </p>
            <div className="text-sm text-primary font-medium">
              🎯 Pilih menu &quot;Buat Ide&quot; di navigasi atas untuk memulai
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

