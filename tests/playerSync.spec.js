import { test, expect } from '@playwright/test';

test.describe('Phase 3: YouTube Synced Player Acceptance', () => {
  test('Two browser contexts stay in sync: set-video, play, pause, seek', async ({ browser }) => {
    const roomId = `sync-${Date.now().toString(36)}`;
    const password = 'syncPassword123';

    // 1. Context A creates room
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto('/');

    await pageA.locator('#roomId').fill(roomId);
    await pageA.locator('#password').fill(password);
    await pageA.locator('#displayName').fill('UserA');
    await pageA.getByRole('button', { name: 'Create & Enter Room' }).click();

    await expect(pageA).toHaveURL(new RegExp(`/room/${roomId}`));
    await expect(pageA.getByText(roomId)).toBeVisible();

    // 2. Context B joins the room
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto('/');

    await pageB.getByRole('button', { name: 'Switch to Join Room' }).click();
    await pageB.locator('#roomId').fill(roomId);
    await pageB.locator('#password').fill(password);
    await pageB.locator('#displayName').fill('UserB');
    await pageB.locator('form').getByRole('button', { name: 'Join Room' }).click();

    await expect(pageB).toHaveURL(new RegExp(`/room/${roomId}`));
    await expect(pageB.getByText(roomId)).toBeVisible();

    // Wait for sockets on both pages to connect
    await pageA.waitForFunction(() => Boolean(window.__socket?.connected));
    await pageB.waitForFunction(() => Boolean(window.__socket?.connected));

    // 3. User A selects video
    const testVideoId = 'dQw4w9WgXcQ';
    await pageA.evaluate((vid) => {
      window.__socket.emit('player:set-video', { videoId: vid });
    }, testVideoId);

    // Verify User B receives video within 2 seconds
    await pageB.waitForFunction(
      (expectedVid) => {
        return (
          window.__afterspot_playerState?.videoId === expectedVid ||
          document.querySelector(`iframe[src*="${expectedVid}"]`) !== null
        );
      },
      testVideoId,
      { timeout: 3000 }
    );

    // 4. Verify pause synchronization: A pauses, B pauses
    await pageA.evaluate(() => {
      window.__socket.emit('player:pause', { positionSec: 10 });
    });

    await pageB.waitForFunction(
      () => window.__afterspot_playerState?.status === 'paused',
      null,
      { timeout: 3000 }
    );

    // 5. Verify seek synchronization: A seeks to 42s, B follows
    await pageA.evaluate(() => {
      window.__socket.emit('player:seek', { positionSec: 42 });
    });

    await pageB.waitForFunction(
      () => window.__afterspot_playerState?.positionSec === 42,
      null,
      { timeout: 3000 }
    );

    await contextA.close();
    await contextB.close();
  });
});
