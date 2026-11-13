import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from './computeLayout.js';

function createParticipant(id, overrides = {}) {
  return {
    id,
    clientId: `client-${id}`,
    name: `User ${id}`,
    isLocal: id === 'local',
    isHost: false,
    audioEnabled: true,
    videoEnabled: true,
    isScreenSharing: false,
    handRaisedAt: null,
    connectionQuality: 'good',
    stream: null,
    joinedAt: 1000 + Number(id.replace(/\D/g, '') || 0),
    ...overrides
  };
}

describe('computeLayout Unit Tests', () => {
  const desktopViewport = { width: 1280, height: 720, isMobile: false };
  const tabletViewport = { width: 768, height: 1024, isMobile: false };
  const mobilePortraitViewport = { width: 390, height: 844, isMobile: true };
  const mobileLandscapeViewport = { width: 844, height: 390, isMobile: true };

  it('1 participant: centers a single maximized tile', () => {
    const participants = [createParticipant('local', { isLocal: true })];
    const result = computeLayout({
      participants,
      mode: 'auto',
      viewport: desktopViewport
    });

    assert.equal(result.mode, 'tiled');
    assert.equal(result.tiles.length, 1);
    assert.equal(result.pageCount, 1);
    assert.equal(result.pip, null);
    assert.equal(result.tiles[0].id, 'local');
    assert.ok(result.tiles[0].width > 0);
    assert.ok(result.tiles[0].height > 0);
    // 16:9 check
    const ratio = result.tiles[0].width / result.tiles[0].height;
    assert.ok(Math.abs(ratio - 16 / 9) < 0.05);
  });

  it('2 participants (auto): returns 1:1 with draggable self-view PiP', () => {
    const participants = [
      createParticipant('local', { isLocal: true }),
      createParticipant('peer-1')
    ];
    const result = computeLayout({
      participants,
      mode: 'auto',
      viewport: desktopViewport
    });

    assert.equal(result.mode, 'tiled');
    assert.equal(result.tiles.length, 1);
    assert.equal(result.tiles[0].id, 'peer-1');
    assert.ok(result.pip !== null);
    assert.equal(result.pip.id, 'local');
    assert.ok(result.pip.width > 0);
    assert.ok(result.pip.height > 0);
  });

  it('3 participants: tiled mode with 3 tiles', () => {
    const participants = [
      createParticipant('local', { isLocal: true }),
      createParticipant('peer-1'),
      createParticipant('peer-2')
    ];
    const result = computeLayout({
      participants,
      mode: 'auto',
      viewport: desktopViewport
    });

    assert.equal(result.mode, 'tiled');
    assert.equal(result.tiles.length, 3);
    assert.equal(result.pip, null);
    assert.equal(result.pageCount, 1);
  });

  it('5 participants: tiled mode with optimal cols/rows', () => {
    const participants = Array.from({ length: 5 }, (_, i) =>
      createParticipant(i === 0 ? 'local' : `peer-${i}`, { isLocal: i === 0 })
    );
    const result = computeLayout({
      participants,
      mode: 'tiled',
      viewport: desktopViewport
    });

    assert.equal(result.tiles.length, 5);
    // All tiles have valid dimensions
    for (const tile of result.tiles) {
      assert.ok(tile.width > 0);
      assert.ok(tile.height > 0);
      assert.ok(tile.x >= 0);
      assert.ok(tile.y >= 0);
    }
  });

  it('9 participants on tablet: fits 9 tiles on 1 page', () => {
    const participants = Array.from({ length: 9 }, (_, i) =>
      createParticipant(i === 0 ? 'local' : `peer-${i}`, { isLocal: i === 0 })
    );
    const result = computeLayout({
      participants,
      mode: 'tiled',
      viewport: tabletViewport
    });

    assert.equal(result.pageCount, 1);
    assert.equal(result.tiles.length, 9);
  });

  it('17 participants on desktop: exceeds 16-tile limit, creates 2 pages', () => {
    const participants = Array.from({ length: 17 }, (_, i) =>
      createParticipant(i === 0 ? 'local' : `peer-${i}`, { isLocal: i === 0 })
    );
    const resultPage0 = computeLayout({
      participants,
      mode: 'tiled',
      viewport: desktopViewport,
      pageIndex: 0
    });

    assert.equal(resultPage0.pageCount, 2);
    assert.equal(resultPage0.pageIndex, 0);
    assert.equal(resultPage0.tiles.length, 16);

    const resultPage1 = computeLayout({
      participants,
      mode: 'tiled',
      viewport: desktopViewport,
      pageIndex: 1
    });

    assert.equal(resultPage1.pageIndex, 1);
    assert.equal(resultPage1.tiles.length, 1);
  });

  it('30 participants on desktop: creates 2 pages (16 + 14)', () => {
    const participants = Array.from({ length: 30 }, (_, i) =>
      createParticipant(i === 0 ? 'local' : `peer-${i}`, { isLocal: i === 0 })
    );
    const result = computeLayout({
      participants,
      mode: 'tiled',
      viewport: desktopViewport,
      pageIndex: 0
    });

    assert.equal(result.pageCount, 2);
    assert.equal(result.tiles.length, 16);

    const page2 = computeLayout({
      participants,
      mode: 'tiled',
      viewport: desktopViewport,
      pageIndex: 1
    });
    assert.equal(page2.tiles.length, 14);
  });

  it('Portrait viewport (mobile portrait): 6 tiles per page', () => {
    const participants = Array.from({ length: 8 }, (_, i) =>
      createParticipant(i === 0 ? 'local' : `peer-${i}`, { isLocal: i === 0 })
    );
    const result = computeLayout({
      participants,
      mode: 'tiled',
      viewport: mobilePortraitViewport,
      pageIndex: 0
    });

    assert.equal(result.pageCount, 2);
    assert.equal(result.tiles.length, 6);
  });

  it('Landscape viewport: tile areas maximized horizontally', () => {
    const participants = Array.from({ length: 4 }, (_, i) =>
      createParticipant(i === 0 ? 'local' : `peer-${i}`, { isLocal: i === 0 })
    );
    const result = computeLayout({
      participants,
      mode: 'tiled',
      viewport: mobileLandscapeViewport
    });

    assert.equal(result.tiles.length, 4);
    assert.ok(result.tiles[0].width > result.tiles[0].height);
  });

  it('Pinned participant: triggers spotlight mode with pinned as focus', () => {
    const participants = [
      createParticipant('local', { isLocal: true }),
      createParticipant('peer-1'),
      createParticipant('peer-2')
    ];
    const result = computeLayout({
      participants,
      mode: 'auto',
      pinnedId: 'peer-2',
      viewport: desktopViewport
    });

    assert.equal(result.mode, 'spotlight');
    assert.equal(result.tiles[0].id, 'peer-2'); // Focus tile first
    assert.ok(result.tiles.length >= 2); // Focus + filmstrip
  });

  it('Presenting ID set: triggers spotlight with screen share as focus', () => {
    const participants = [
      createParticipant('local', { isLocal: true }),
      createParticipant('peer-1')
    ];
    const result = computeLayout({
      participants,
      mode: 'auto',
      presentingId: 'peer-1',
      viewport: desktopViewport
    });

    assert.equal(result.mode, 'spotlight');
    assert.equal(result.tiles[0].id, 'peer-1');
    assert.equal(result.tiles[0].kind, 'screen');
  });

  it('Stage active: triggers spotlight with stage as focus', () => {
    const participants = [
      createParticipant('local', { isLocal: true }),
      createParticipant('peer-1')
    ];
    const result = computeLayout({
      participants,
      mode: 'auto',
      stageActive: true,
      viewport: desktopViewport
    });

    assert.equal(result.mode, 'spotlight');
    assert.equal(result.tiles[0].id, 'stage');
    assert.equal(result.tiles[0].kind, 'stage');
  });

  it('Page boundaries: pageIndex clamps gracefully', () => {
    const participants = Array.from({ length: 18 }, (_, i) =>
      createParticipant(i === 0 ? 'local' : `peer-${i}`, { isLocal: i === 0 })
    );
    const resultOver = computeLayout({
      participants,
      mode: 'tiled',
      viewport: desktopViewport,
      pageIndex: 99
    });
    // pageCount is 2, pageIndex clamped to 1
    assert.equal(resultOver.pageCount, 2);
    assert.equal(resultOver.pageIndex, 1);

    const resultNegative = computeLayout({
      participants,
      mode: 'tiled',
      viewport: desktopViewport,
      pageIndex: -5
    });
    assert.equal(resultNegative.pageIndex, 0);
  });

  it('Speaker swap-in: speaker on page 2 is swapped into page 1', () => {
    // 20 participants. Desktop page size = 16.
    // Local is index 0.
    // Peer-19 is at the very end (normally on page 2).
    // Set activeSpeakerId to 'peer-19'.
    const participants = Array.from({ length: 20 }, (_, i) =>
      createParticipant(i === 0 ? 'local' : `peer-${i}`, {
        isLocal: i === 0,
        joinedAt: 1000 + i,
        lastActiveSpeakerAt: i === 19 ? Date.now() : 0
      })
    );

    const result = computeLayout({
      participants,
      mode: 'tiled',
      activeSpeakerId: 'peer-19',
      viewport: desktopViewport,
      pageIndex: 0
    });

    assert.equal(result.pageCount, 2);
    // Page 1 must contain peer-19
    const page1Ids = result.tiles.map(t => t.id);
    assert.ok(page1Ids.includes('peer-19'), 'active speaker should be swapped into page 1');
    assert.ok(page1Ids.includes('local'), 'local participant must remain on page 1');
  });

  it('Sidebar mode on desktop places filmstrip on the right', () => {
    const participants = [
      createParticipant('local', { isLocal: true }),
      createParticipant('peer-1'),
      createParticipant('peer-2')
    ];
    const result = computeLayout({
      participants,
      mode: 'sidebar',
      pinnedId: 'peer-1',
      viewport: desktopViewport
    });

    assert.equal(result.mode, 'sidebar');
    const mainTile = result.tiles[0];
    const filmstripTile = result.tiles[1];
    // Main tile is on left, filmstrip is on right
    assert.ok(filmstripTile.x > mainTile.x);
  });
});
