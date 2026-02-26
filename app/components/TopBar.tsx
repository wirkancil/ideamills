'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { Sparkles, History, BarChart3, Home } from 'lucide-react';

export function TopBar() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/',
      label: 'Beranda',
      icon: Home,
      active: pathname === '/'
    },
    {
      href: '/dashboard',
      label: 'Buat Ide',
      icon: BarChart3,
      active: pathname === '/dashboard'
    },
    {
      href: '/history',
      label: 'Riwayat',
      icon: History,
      active: pathname === '/history'
    }
  ];

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" />
            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              IdeaMill
            </span>
          </Link>

          {/* Navigation */}
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={item.active ? "default" : "ghost"}
                    className="flex items-center gap-2"
                    size="sm"
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
