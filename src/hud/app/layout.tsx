import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'VDT Debug HUD',
  description: 'Visual Debugging Tool - Debug HUD for real-time monitoring',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-mono bg-gray-50 dark:bg-gray-900">{children}</body>
    </html>
  )
}