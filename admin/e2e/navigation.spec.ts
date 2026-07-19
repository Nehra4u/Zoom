import { test, expect } from '@playwright/test'
import { mockApiRoutes, seedAdminSession } from './helpers/mockApi'

const ADMIN_ROUTES = [
  '/dashboard',
  '/users',
  '/users/new',
  '/users/user-1',
  '/recordings',
  '/user-recordings',
  '/audit-logs',
  '/system',
  '/app-info',
]

const SUPER_ADMIN_ROUTES = ['/admins', '/admins/new', '/admins/admin-1']

test.describe('Navigation', () => {
  test('regular admin routes load without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await mockApiRoutes(page, 'admin')
    await seedAdminSession(page, 'admin')

    for (const path of ADMIN_ROUTES) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    }

    expect(errors).toEqual([])
  })

  test('super admin routes load without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await mockApiRoutes(page, 'super_admin')
    await seedAdminSession(page, 'super_admin')

    for (const path of SUPER_ADMIN_ROUTES) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    }

    expect(errors).toEqual([])
  })
})
