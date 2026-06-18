import type { Metadata } from 'next'
import './globals.css'
import QueryProvider from '@/providers/QueryProvider'

export const metadata: Metadata = {
  title: 'Hangers CRM — Staff Dashboard',
  description: 'Hangers Clothes Spa Management System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}
