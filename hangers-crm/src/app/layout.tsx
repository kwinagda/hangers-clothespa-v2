import type { Metadata } from 'next'
import './globals.css'
import QueryProvider from '@/providers/QueryProvider'
import TextInputCapitalizer from '@/components/TextInputCapitalizer'

export const metadata: Metadata = {
  title: 'Hangers CRM — Staff Dashboard',
  description: 'Hangers Clothes Spa Management System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <TextInputCapitalizer />
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}
