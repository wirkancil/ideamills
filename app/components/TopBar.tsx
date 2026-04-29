'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, History, Clapperboard, Images } from 'lucide-react';

export function TopBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-bold text-base">IdeaMills</span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              href="/studio"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === '/studio' || pathname === '/'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Clapperboard className="w-4 h-4" />
              Studio
            </Link>
            <Link
              href="/assets"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === '/assets'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Images className="w-4 h-4" />
              Aset
            </Link>
            <Link
              href="/history"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === '/history' || pathname.startsWith('/generations')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <History className="w-4 h-4" />
              Riwayat
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
