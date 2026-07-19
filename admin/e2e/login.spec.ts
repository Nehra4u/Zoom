import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.clear()
      localStorage.clear()
    })
  })

  test('renders login form', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('#identifier')).toBeVisible()
  })

  test('redirects unauthenticated users from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'commit', timeout: 15_000 })
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
