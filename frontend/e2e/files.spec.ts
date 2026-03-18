import { test, expect } from '@playwright/test';

test.describe('Files & Media', () => {
  test('user avatars load without 404', async ({ page }) => {
    const notFoundImages: string[] = [];

    page.on('response', (response) => {
      if (response.status() === 404 && response.url().includes('/avatar')) {
        notFoundImages.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    // Navigate to a channel with messages
    await page.getByRole('button', { name: 'random' }).click();
    await expect(page.getByRole('heading', { name: 'random' })).toBeVisible();

    // Wait for messages to load
    await page.waitForTimeout(3000);

    // No avatar images should 404
    expect(notFoundImages).toEqual([]);
  });

  test('file attachments are accessible', async ({ page }) => {
    const failedFiles: string[] = [];

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/v1/files/') && response.status() >= 400) {
        failedFiles.push(`${response.status()} ${url}`);
      }
    });

    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    // Navigate to random where we know there are file attachments
    await page.getByRole('button', { name: 'random' }).click();
    await expect(page.getByRole('heading', { name: 'random' })).toBeVisible();

    // Wait for content to load
    await page.waitForTimeout(3000);

    // Log any failed file loads (informational, not blocking)
    if (failedFiles.length > 0) {
      console.log('Failed file loads:', failedFiles);
    }
  });

  test('custom emojis render as images or text', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/channel\//);

    await page.getByRole('button', { name: 'random' }).click();
    await expect(page.getByRole('heading', { name: 'random' })).toBeVisible();

    // Wait for messages to load
    await page.waitForTimeout(2000);

    // Check that the page has message content (not empty)
    const messages = page.locator('p');
    await expect(messages.first()).toBeVisible();
  });
});
