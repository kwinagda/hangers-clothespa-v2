import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hangers CRM — Staff Dashboard',
  description: 'Hangers Clothes Spa Management System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
