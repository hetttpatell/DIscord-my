import { test, expect, devices } from '@playwright/test';

const mobileDevices = [
  { name: 'iPhone 13', profile: devices['iPhone 13'] },
  { name: 'Pixel 7', profile: devices['Pixel 7'] },
];

for (const { name, profile } of mobileDevices) {
  test.describe(`Phase 4: YouTube Mobile Search Acceptance (${name})`, () => {
    test(`search on mobile opens vaul drawer, displays results, and selecting loads video`, async ({
      browser,
    }) => {
      // Create new context with the mobile device profile (viewport, userAgent, isMobile, touch)
      const context = await browser.newContext({
        viewport: profile.viewport,
        userAgent: profile.userAgent,
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
      });
      const page = await context.newPage();

      const roomId = `mob-${Date.now().toString(36)}-${name.replace(/\s+/g, '').toLowerCase()}`;
      const password = 'pass1234Mobile';
      const mockVideoId = 'mockVideo123';

      // Mock the YouTube search API endpoint
      await page.route('**/api/search*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              videoId: mockVideoId,
              title: 'Mock Mobile Track',
              channel: 'Mobile Artist',
              thumbnailUrl: 'https://i.ytimg.com/vi/mockVideo123/hqdefault.jpg',
              durationSec: 180,
            },
          ]),
        });
      });

      // 1. Enter lobby and create room
      await page.goto('/');
      await page.locator('#roomId').fill(roomId);
      await page.locator('#password').fill(password);
      await page.locator('#displayName').fill('MobileUser');
      await page.getByRole('button', { name: 'Create & Enter Room' }).click();

      await expect(page).toHaveURL(new RegExp(`/room/${roomId}`));

      // 2. Open Search via bottom dock
      const searchButton = page.getByRole('button', { name: 'Search YouTube tracks' });
      await expect(searchButton).toBeVisible();
      await searchButton.click();

      // 3. Verify search drawer opens with input
      const searchInput = page.getByPlaceholder('Search songs, artists, or paste video title...');
      await expect(searchInput).toBeVisible();

      // Verify font-size >= 16px to prevent iOS auto-zoom
      const fontSize = await searchInput.evaluate((el) => window.getComputedStyle(el).fontSize);
      const fontSizePx = parseFloat(fontSize);
      expect(fontSizePx).toBeGreaterThanOrEqual(16);

      // 4. Type query
      await searchInput.fill('Mock Mobile Track');

      // 5. Result rendered as accessible button with min 44px tap target
      const resultItem = page.getByRole('button', {
        name: /Play Mock Mobile Track by Mobile Artist/i,
      });
      await expect(resultItem).toBeVisible({ timeout: 5000 });

      const box = await resultItem.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);

      // 6. Tap result
      await resultItem.click();

      // 7. Verify search drawer closes and player loads the video ID
      await page.waitForFunction(
        (vid) => window.__afterspot_playerState?.videoId === vid,
        mockVideoId,
        { timeout: 4000 }
      );

      const loadedVid = await page.evaluate(() => window.__afterspot_playerState?.videoId);
      expect(loadedVid).toBe(mockVideoId);

      await context.close();
    });
  });
}
