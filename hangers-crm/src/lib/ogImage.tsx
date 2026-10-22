import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fontFile = (weight: 500 | 700) => readFileSync(join(process.cwd(), 'src/lib/fonts', `space-grotesk-${weight}.woff`))
const fonts = [
  { name: 'Space Grotesk', data: fontFile(500), weight: 500 as const, style: 'normal' as const },
  { name: 'Space Grotesk', data: fontFile(700), weight: 700 as const, style: 'normal' as const },
]

export function ogImage(element: React.ReactElement, options: { width?: number; height?: number } = {}) {
  return new ImageResponse(element, { width: 1200, height: 630, ...options, fonts })
}
