import { TopBar } from '../components/TopBar';
import { GenerationHistory } from '../components/GenerationHistory';

export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-xl font-bold mb-6">Riwayat Generation</h1>
        <GenerationHistory />
      </div>
    </div>
  );
}
