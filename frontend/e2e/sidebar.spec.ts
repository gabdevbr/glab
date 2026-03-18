import { test, expect } from '@playwright/test';

test.describe('Sidebar', () => {
  test('channels load in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    // Should show the Channels section header
    await expect(page.locator('span', { hasText: 'Channels' }).first()).toBeVisible();

    // Should show at least one channel (e.g. "random" or "general")
    const channelButtons = page.locator('button').filter({ hasText: /^(random|general)$/ });
    await expect(channelButtons.first()).toBeVisible({ timeout: 10000 });
  });

  test('DM names are readable (not RC hashes)', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    await expect(page.getByText('Direct Messages')).toBeVisible();

    // DM buttons should contain readable names (spaces, commas) not RC hashes
    const dmSection = page.locator('text=Direct Messages').locator('..');
    const dmList = dmSection.locator('..').locator('ul').first();

    // Wait for DMs to load
    const firstDm = dmList.locator('button').first();
    if (await firstDm.isVisible({ timeout: 5000 }).catch(() => false)) {
      const dmName = await firstDm.textContent();
      // RC hashes are 30+ chars without spaces; real names have spaces
      expect(dmName).toBeTruthy();
      expect(dmName!.length).toBeLessThan(80);
      // Should contain at least one space (display names have spaces)
      expect(dmName).toMatch(/\s/);
    }
  });

  test('bug report button is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    await expect(page.getByRole('button', { name: 'Report a bug' })).toBeVisible();
  });
});
