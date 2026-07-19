import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsDir = path.join(__dirname, '..', 'dist', 'assets')

test.describe('Bundle output', () => {
  test('build produces multiple JS chunks after code splitting', async () => {
    test.skip(!fs.existsSync(assetsDir), 'Run npm run build first')

    const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
    expect(jsFiles.length).toBeGreaterThan(1)
  })
})
