import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'IdeaMill - AI Ad Variation Generator',
  description: 'Generate 100 storyboard-ready ad variations with AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
          {children}
        </div>
      </body>
    </html>
  )
}

