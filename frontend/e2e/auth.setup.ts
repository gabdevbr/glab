import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page, baseURL }) => {
  const email = process.env.E2E_USER || 'gabriel@ibtech.inf.br';
  const password = process.env.E2E_PASS || 'glab-migrated-2026';

  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Username or Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to a channel page
  await page.waitForURL(/\/channel\//, { timeout: 10000 });

  // Verify sidebar loaded — use the section header span specifically
  await expect(page.locator('span', { hasText: 'Channels' }).first()).toBeVisible();

  // Save auth state
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.context().storageState({ path: authFile });
});
