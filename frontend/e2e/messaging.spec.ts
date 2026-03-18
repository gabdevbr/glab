import { test, expect } from '@playwright/test';

test.describe('Messaging', () => {
  test('can send a message in a channel', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    // Click on "random" channel
    await page.getByRole('button', { name: 'random' }).click();
    await expect(page.getByRole('heading', { name: 'random' })).toBeVisible();

    // Wait for message input to be enabled
    const input = page.getByRole('textbox', { name: /Message #random/ });
    await expect(input).toBeEnabled({ timeout: 10000 });

    // Send a test message
    const testMsg = `e2e-test-${Date.now()}`;
    await input.fill(testMsg);
    await input.press('Enter');

    // Wait for input to clear (confirms message was sent)
    await expect(input).toHaveValue('', { timeout: 5000 });

    // Scroll chat container to bottom so new message is visible
    await page.evaluate(() => {
      const container = document.querySelector('[class*="overflow-y"]');
      if (container) container.scrollTop = container.scrollHeight;
    });

    // Message should appear in the chat
    await expect(page.getByText(testMsg)).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to a DM and see messages', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    // Find first DM in sidebar
    const dmSection = page.getByText('Direct Messages');
    await expect(dmSection).toBeVisible();

    // Click first DM button (after Direct Messages header)
    const dmList = dmSection.locator('..').locator('..').locator('ul').first();
    const firstDm = dmList.locator('button').first();
    if (await firstDm.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstDm.click();

      // Should navigate to a DM channel and show message input
      await page.waitForURL(/\/channel\//);
      const msgInput = page.getByRole('textbox', { name: /Message/ });
      await expect(msgInput).toBeVisible({ timeout: 10000 });
    }
  });

  test('WebSocket connects successfully', async ({ page }) => {
    const wsConnected = new Promise<boolean>((resolve) => {
      page.on('console', (msg) => {
        if (msg.text().includes('[WS] connected')) resolve(true);
      });
      setTimeout(() => resolve(false), 15000);
    });

    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    expect(await wsConnected).toBe(true);
  });
});
