export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import LoginClient from './login-client'

export default function LoginPage() {
  return <LoginClient />
}
