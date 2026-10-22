export type MarketingClipId =
  | 'welcome' | 'curtain' | 'journey' | 'fabric' | 'rider' | 'services' | 'rates' | 'plans'
  | 'zones' | 'book' | 'contact' | 'about' | 'corporate' | 'faq' | 'journal' | 'otpok' | 'otpfail'

export type MarketingClip = {
  page: string
  slot: string
  title: string
  file: string
  ratio: string
  fileM?: string
  ratioM?: string
  ready: boolean
}

const BASE = '/marketing-video/'

export const MARKETING_CLIPS: Record<MarketingClipId, MarketingClip> = {
  welcome: { page: 'Home', slot: 'Hero card', title: 'Avatar welcome', file: 'welcome', ratio: '4/5', ready: true },
  curtain: { page: 'Home', slot: 'Curtain band', title: 'Curtain removal to reinstall', file: 'curtain', ratio: '16/10', fileM: 'curtain-m', ratioM: '4/5', ready: true },
  journey: { page: 'Home', slot: 'See it in motion 1', title: 'Pickup to delivery journey', file: 'journey', ratio: '4/5', ready: true },
  fabric: { page: 'Home', slot: 'See it in motion 2', title: 'Fabric and stain close-ups', file: 'fabric', ratio: '4/5', ready: true },
  rider: { page: 'Home', slot: 'See it in motion 3', title: 'Rider arriving at your door', file: 'rider', ratio: '4/5', ready: true },
  services: { page: 'Services', slot: 'Below intro', title: 'Services montage', file: 'services', ratio: '16/10', fileM: 'services-m', ratioM: '4/5', ready: true },
  rates: { page: 'Rate chart', slot: 'Above search', title: 'How rates are grouped', file: 'rates', ratio: '16/10', ready: true },
  plans: { page: 'Monthly plans', slot: 'Below plan cards', title: 'How a monthly plan works', file: 'plans', ratio: '16/10', ready: true },
  zones: { page: 'Pickup zones', slot: 'Below marquee', title: 'Central Line route map', file: 'zones', ratio: '16/10', fileM: 'zones-m', ratioM: '4/5', ready: true },
  book: { page: 'Book a pickup', slot: 'Beside form (desktop) / top (mobile)', title: 'Book in about two minutes', file: 'book', ratio: '9/16', ready: true },
  contact: { page: 'Contact', slot: 'Below hero', title: 'Find the shop', file: 'contact-v4', ratio: '16/10', ready: true },
  about: { page: 'About', slot: 'Below intro', title: 'The Hangers approach', file: 'about', ratio: '16/10', ready: true },
  corporate: { page: 'Corporate accounts', slot: 'Below intro', title: 'Business plans and onboarding', file: 'corporate', ratio: '16/10', ready: true },
  faq: { page: 'FAQ', slot: 'Below intro', title: 'Quick answers', file: 'faq-v3', ratio: '16/9', ready: true },
  journal: { page: 'Journal', slot: 'Below intro', title: 'Garment-care tips', file: 'journal', ratio: '16/10', ready: true },
  otpok: { page: 'Book a pickup', slot: 'OTP success', title: 'Pickup confirmed', file: 'otpok', ratio: '1/1', ready: true },
  otpfail: { page: 'Book a pickup', slot: 'OTP failure (not wired; page uses shake)', title: 'Code did not match', file: 'otpfail', ratio: '1/1', ready: false },
}

export function clipSources(clip: MarketingClip, mobile: boolean) {
  const name = mobile && clip.fileM ? clip.fileM : clip.file
  return { webm: `${BASE}${name}.webm`, mp4: `${BASE}${name}.mp4` }
}

export function clipRatio(clip: MarketingClip, mobile: boolean) {
  return mobile && clip.ratioM ? clip.ratioM : clip.ratio
}
