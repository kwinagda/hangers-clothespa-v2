import '../globals.css'

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Space+Mono:wght@400;500&display=swap" precedence="default" />
    {children}
  </>
}
