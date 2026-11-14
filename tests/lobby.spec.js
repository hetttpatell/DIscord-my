import { test, expect } from '@playwright/test';

test.describe('Lobby Page Acceptance', () => {
  test('loads the lobby page with no console errors and renders all required elements', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // Check page title and brand header
    await expect(page).toHaveTitle(/afterspot/);
    await expect(page.getByRole('heading', { name: 'afterspot' })).toBeVisible();

    // Check tabs
    await expect(page.getByRole('button', { name: 'Switch to Create Room' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to Join Room' })).toBeVisible();

    // Check inputs
    await expect(page.locator('#roomId')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#displayName')).toBeVisible();

    // Check submit button
    await expect(page.getByRole('button', { name: 'Create & Enter Room' })).toBeVisible();

    // Verify switch to Join Room tab
    await page.getByRole('button', { name: 'Switch to Join Room' }).click();
    await expect(page.locator('form').getByRole('button', { name: 'Join Room' })).toBeVisible();

    // Assert 0 console errors
    expect(consoleErrors).toEqual([]);
  });
});

