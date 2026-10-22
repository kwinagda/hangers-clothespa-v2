import '../public.css'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>
    <link rel="preload" href="/fonts/space-grotesk-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    {children}
  </>
}
