import test from 'node:test';
import assert from 'node:assert/strict';
import { YouTubeSearchService, YOUTUBE_CACHE_TTL_MS } from './youtubeSearch.js';

test('YouTube Search & URL Resolution Unit Tests', async (t) => {
  await t.test('extractVideoId accurately handles all YouTube URL flavors and raw IDs', () => {
    const validCases = [
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'dQw4w9WgXcQ'],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
      ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtube.com/shorts/dQw4w9WgXcQ?feature=share', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['dQw4w9WgXcQ', 'dQw4w9WgXcQ']
    ];

    for (const [input, expected] of validCases) {
      assert.equal(YouTubeSearchService.extractVideoId(input), expected, `Failed for input: ${input}`);
    }

    const invalidCases = [
      '',
      '   ',
      'https://vimeo.com/12345678',
      'https://spotify.com/track/123',
      'not an id',
      '12345',
      null,
      undefined
    ];

    for (const input of invalidCases) {
      assert.equal(YouTubeSearchService.extractVideoId(input), null, `Expected null for input: ${input}`);
    }
  });

  await t.test('Pasted URL uses direct resolution with zero search quota', async () => {
    let calledUrl = '';
    const mockFetch = async (url) => {
      calledUrl = url;
      return {
        ok: true,
        json: async () => ({
          items: [{
            id: 'dQw4w9WgXcQ',
            snippet: {
              title: 'Never Gonna Give You Up',
              channelTitle: 'Rick Astley',
              thumbnails: { high: { url: 'https://example.com/rick.jpg' } }
            }
          }]
        })
      };
    };

    const service = new YouTubeSearchService({ apiKey: 'AIzaMockKey', fetchFn: mockFetch });
    const res = await service.search({ query: 'https://youtu.be/dQw4w9WgXcQ' });

    assert.equal(res.isDirect, true);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].id, 'dQw4w9WgXcQ');
    assert.equal(res.items[0].title, 'Never Gonna Give You Up');
    assert.ok(calledUrl.includes('videos?part=snippet'), 'Must call videos.list instead of search');
  });

  await t.test('Search includes videoEmbeddable=true and videoSyndicated=true', async () => {
    let capturedUrl = '';
    const mockFetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({
          items: [{
            id: { videoId: 'abc12345678' },
            snippet: {
              title: 'Lofi Study Beats',
              channelTitle: 'Lofi Girl',
              thumbnails: { high: { url: 'https://example.com/thumb.jpg' } }
            }
          }]
        })
      };
    };

    const service = new YouTubeSearchService({ apiKey: 'AIzaMockKey', fetchFn: mockFetch });
    const res = await service.search({ query: 'lofi beats' });

    assert.equal(res.items.length, 1);
    assert.ok(capturedUrl.includes('videoEmbeddable=true'), 'Search URL must contain videoEmbeddable=true');
    assert.ok(capturedUrl.includes('videoSyndicated=true'), 'Search URL must contain videoSyndicated=true');
    assert.ok(capturedUrl.includes('type=video'), 'Search URL must contain type=video');
  });

  await t.test('Search results are cached for 10 minutes per normalized query', async () => {
    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount++;
      return {
        ok: true,
        json: async () => ({
          items: [{
            id: { videoId: 'track123456' },
            snippet: { title: 'Chill Beat', channelTitle: 'Artist', thumbnails: {} }
          }]
        })
      };
    };

    const service = new YouTubeSearchService({ apiKey: 'AIzaMockKey', fetchFn: mockFetch });
    const t0 = 1000000;

    // First search: calls API
    const res1 = await service.search({ query: 'Chill Beat', now: t0 });
    assert.equal(fetchCount, 1);
    assert.equal(res1.cached, false);

    // Second search with case difference: served from cache
    const res2 = await service.search({ query: 'chill beat', now: t0 + 5000 });
    assert.equal(fetchCount, 1);
    assert.equal(res2.cached, true);

    // After 10 minutes (TTL expired): refetches
    const res3 = await service.search({ query: 'chill beat', now: t0 + YOUTUBE_CACHE_TTL_MS + 1000 });
    assert.equal(fetchCount, 2);
    assert.equal(res3.cached, false);
  });

  await t.test('Maps 403 quotaExceeded error to structured human error message', async () => {
    const mockFetch = async () => {
      return {
        ok: false,
        json: async () => ({
          error: {
            code: 403,
            errors: [{ reason: 'quotaExceeded' }],
            message: 'Daily Limit Exceeded'
          }
        })
      };
    };

    const service = new YouTubeSearchService({ apiKey: 'AIzaMockKey', fetchFn: mockFetch });
    const res = await service.search({ query: 'popular songs' });

    assert.equal(res.error, 'QUOTA_EXCEEDED');
    assert.ok(res.message.includes('quota reached'), 'Error message must explain quota limit');
    assert.ok(res.message.includes('paste YouTube links directly'), 'Must offer paste alternative');
  });

  await t.test('Client rate limit blocks after 15 searches within 1 minute', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ items: [] })
    });

    const service = new YouTubeSearchService({ apiKey: 'AIzaMockKey', fetchFn: mockFetch });
    const clientId = 'tab-test-client-1';
    const now = 2000000;

    for (let i = 0; i < 15; i++) {
      const res = await service.search({ query: `query ${i}`, clientId, now: now + i * 100 });
      assert.notEqual(res.error, 'RATE_LIMITED');
    }

    // 16th search is rate limited
    const limitedRes = await service.search({ query: 'query 16', clientId, now: now + 2000 });
    assert.equal(limitedRes.error, 'RATE_LIMITED');
    assert.ok(limitedRes.message.includes('Too many searches'));
  });
});

