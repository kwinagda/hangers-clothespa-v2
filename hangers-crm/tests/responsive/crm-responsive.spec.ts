import { expect, test } from '@playwright/test'
import { auditDevices, crmRoutes } from './routes'

test('CRM route matrix has no viewport overflow or runtime failures', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = []
  await page.goto('/dashboard')
  page.on('pageerror', error => runtimeErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('favicon')) runtimeErrors.push(message.text())
  })
  page.on('response', response => {
    if (response.status() === 401) runtimeErrors.push(`401 ${response.request().method()} ${response.url()} while ${page.url()}`)
  })

  for (const device of auditDevices) {
    await page.setViewportSize({ width: device.width, height: device.height })
    for (const route of crmRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.locator('body').waitFor({ state: 'visible' })
      if (/\/login/.test(page.url())) {
        throw new Error(`${device.name} ${route} redirected to login. Recent errors: ${runtimeErrors.slice(-6).join(' | ')}`)
      }
      await expect(page.locator('body')).not.toContainText('Application error')
      await expect(page.locator('body')).not.toContainText('Cannot find module')

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        offenders: Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter(element => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return rect.right > document.documentElement.clientWidth + 2 && style.position !== 'fixed' && style.position !== 'absolute'
          })
          .slice(0, 8)
          .map(element => `${element.tagName.toLowerCase()}.${element.className}`),
      }))
      expect.soft(overflow.documentWidth, `${device.name} ${route}: ${overflow.offenders.join(', ')}`).toBeLessThanOrEqual(overflow.viewportWidth + 2)

      const slug = route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'dashboard'
      await page.screenshot({ path: testInfo.outputPath(`${device.name}-${slug}.png`), fullPage: false })
    }
  }
  expect(runtimeErrors).toEqual([])
})

test('mobile navigation is searchable and Back closes it first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('dialog', { name: 'CRM navigation' })).toBeVisible()
  await page.getByPlaceholder('Search navigation').fill('pricing')
  await expect(page.getByRole('link', { name: /Pricing/ })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'CRM navigation' })).toBeHidden()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('common modal workflows fit phone and tablet viewports', async ({ page }, testInfo) => {
  await page.goto('/dashboard')
  const cases = [
    { route: '/dashboard/expenses', button: '+ Add Expense', heading: 'Add Expense' },
    { route: '/dashboard/cashbook', button: '+ Add Entry', heading: 'Add Cash Entry' },
    { route: '/dashboard/staff', button: 'Add Staff', heading: 'Add New Staff Member' },
    { route: '/dashboard/promotions', button: '+ Create Coupon', heading: 'Create Coupon' },
    { route: '/dashboard/recurring', button: 'Schedule Recurring', heading: 'Schedule Recurring Pickup' },
  ]
  for (const device of auditDevices.filter(item => item.width <= 768)) {
    await page.setViewportSize({ width: device.width, height: device.height })
    for (const item of cases) {
      await page.goto(item.route, { waitUntil: 'domcontentloaded' })
      const trigger = page.getByRole('button', { name: item.button, exact: true })
      if (!(await trigger.isEnabled())) continue
      await trigger.click()
      const heading = page.getByText(item.heading, { exact: true })
      await expect(heading).toBeVisible()
      const geometry = await heading.evaluate((node) => {
        let overlay = node.parentElement
        while (overlay && getComputedStyle(overlay).position !== 'fixed') overlay = overlay.parentElement
        const panel = overlay?.firstElementChild as HTMLElement | null
        if (!panel) return null
        const rect = panel.getBoundingClientRect()
        return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight }
      })
      expect(geometry).not.toBeNull()
      expect(geometry!.left).toBeGreaterThanOrEqual(-1)
      expect(geometry!.right).toBeLessThanOrEqual(geometry!.viewportWidth + 1)
      expect(geometry!.top).toBeGreaterThanOrEqual(-1)
      expect(geometry!.bottom).toBeLessThanOrEqual(geometry!.viewportHeight + 1)
      await page.screenshot({ path: testInfo.outputPath(`${device.name}-${item.route.split('/').pop()}-modal.png`) })
      const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
      if (await cancel.count()) await cancel.click()
    }
  }
})
