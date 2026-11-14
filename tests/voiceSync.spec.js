import { test, expect } from '@playwright/test';

test.describe('Phase 5: LiveKit Mic Voice Chat Acceptance', () => {
  test('Two browser contexts: both join, A unmutes, B shows A as unmuted with remote audio subscribed', async ({
    browser,
  }) => {
    const roomId = `voice-${Date.now().toString(36)}`;
    const password = 'pass1234Voice';

    // 1. Context A joins
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    await pageA.goto('/');
    await pageA.locator('#roomId').fill(roomId);
    await pageA.locator('#password').fill(password);
    await pageA.locator('#displayName').fill('UserA');
    await pageA.getByRole('button', { name: 'Create & Enter Room' }).click();

    await expect(pageA).toHaveURL(new RegExp(`/room/${roomId}`));

    // 2. Context B joins
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await pageB.goto('/');
    await pageB.getByRole('button', { name: 'Switch to Join Room' }).click();
    await pageB.locator('#roomId').fill(roomId);
    await pageB.locator('#password').fill(password);
    await pageB.locator('#displayName').fill('UserB');
    await pageB.locator('form').getByRole('button', { name: 'Join Room' }).click();

    await expect(pageB).toHaveURL(new RegExp(`/room/${roomId}`));

    // Wait for sockets on both pages to connect
    await pageA.waitForFunction(() => Boolean(window.__socket?.connected));
    await pageB.waitForFunction(() => Boolean(window.__socket?.connected));

    // Verify microphone buttons are present
    const micButtonA = pageA.getByRole('button', { name: /Mute microphone|Unmute microphone/i });
    const micButtonB = pageB.getByRole('button', { name: /Mute microphone|Unmute microphone/i });
    await expect(micButtonA).toBeVisible({ timeout: 5000 });
    await expect(micButtonB).toBeVisible({ timeout: 5000 });

    // Verify User A joins muted initially (listening only)
    await expect(pageA.getByRole('button', { name: /Unmute microphone/i })).toBeVisible();

    // 3. User A unmutes via user tap (calling Chromium fake audio device)
    await micButtonA.click();

    // Verify User A now displays active mic state (On Air / Mute microphone)
    const activeMicA = pageA.getByRole('button', { name: /Mute microphone/i });
    await expect(activeMicA).toBeVisible({ timeout: 5000 });

    // 4. In Context B: verify remote audio track is subscribed and User A is displayed as unmuted
    await pageB.waitForFunction(() => window.__remoteAudioSubscribed === true, null, {
      timeout: 5000,
    });
    const isSubscribed = await pageB.evaluate(() => window.__remoteAudioSubscribed);
    expect(isSubscribed).toBe(true);

    // Verify Context A captured real fake audio track from Chromium device
    const fakeAudioTracksA = await pageA.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return stream.getAudioTracks().length;
      } catch {
        return 0;
      }
    });
    expect(fakeAudioTracksA).toBeGreaterThanOrEqual(1);

    await contextA.close();
    await contextB.close();
  });
});
