import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestMicrophone,
  requestMicrophoneStream,
  stopMicrophone,
  setMicrophoneMuted,
  clearStoredDenialFlags,
  isInAppBrowser,
  getLastGetUserMediaResult,
} from '../src/lib/microphone.js';

describe('Microphone Permission & Stream Manager (src/lib/microphone.js)', () => {
  let mockTrack;
  let mockStream;
  let mockGetUserMedia;
  let mockNavigator;
  let mockWindow;

  beforeEach(() => {
    stopMicrophone();

    mockTrack = {
      kind: 'audio',
      readyState: 'live',
      enabled: true,
      stop: vi.fn(function () {
        this.readyState = 'ended';
      }),
    };

    mockStream = {
      getAudioTracks: vi.fn(() => [mockTrack]),
      getTracks: vi.fn(() => [mockTrack]),
    };

    mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

    mockWindow = {
      isSecureContext: true,
      location: { href: 'https://afterspot.vercel.app/room/test' },
    };

    mockNavigator = {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Chrome/119.0.0.0 Mobile Safari/537.36',
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
      },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'prompt', addEventListener: vi.fn() }),
      },
    };

    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: mockNavigator,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fresh site: requestMicrophoneStream calls getUserMedia directly with recommended constraints', async () => {
    const stream = await requestMicrophoneStream();

    expect(stream).toBe(mockStream);
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const lastResult = getLastGetUserMediaResult();
    expect(lastResult.ok).toBe(true);
  });

  it('stops existing tracks before requesting a new stream to prevent NotReadableError', async () => {
    await requestMicrophoneStream();
    expect(mockTrack.stop).not.toHaveBeenCalled();

    // Call again to simulate re-acquisition
    await requestMicrophoneStream();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('previously blocked: throws exact NotAllowedError on failure', async () => {
    const error = new Error('Permission denied');
    error.name = 'NotAllowedError';
    mockGetUserMedia.mockRejectedValue(error);

    await expect(requestMicrophoneStream()).rejects.toThrow('Permission denied');

    const lastResult = getLastGetUserMediaResult();
    expect(lastResult.ok).toBe(false);
    expect(lastResult.name).toBe('NotAllowedError');
  });

  it('insecure context: throws SecurityError without calling getUserMedia', async () => {
    mockWindow.isSecureContext = false;

    await expect(requestMicrophoneStream()).rejects.toThrow('secure (HTTPS)');
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });

  it('retries with fallback constraints on OverconstrainedError', async () => {
    const overconstrainedErr = new Error('Overconstrained');
    overconstrainedErr.name = 'OverconstrainedError';

    mockGetUserMedia
      .mockRejectedValueOnce(overconstrainedErr)
      .mockResolvedValueOnce(mockStream);

    const stream = await requestMicrophoneStream();

    expect(stream).toBe(mockStream);
    expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    expect(mockGetUserMedia).toHaveBeenLastCalledWith({ audio: true });
  });

  it('in-app browser: detects Instagram / WhatsApp / FBAN webviews', () => {
    mockNavigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 280.0.0.17.112';
    expect(isInAppBrowser()).toBe(true);

    mockNavigator.userAgent = 'Mozilla/5.0 (Linux; Android 13; SM-G991B; wv) AppleWebKit/537.36 Version/4.0 Chrome/114.0.5735.196 Mobile Safari/537.36';
    expect(isInAppBrowser()).toBe(true);

    mockNavigator.userAgent = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/119.0.0.0 Mobile Safari/537.36';
    expect(isInAppBrowser()).toBe(false);
  });

  it('toggles mute via track.enabled without recreating or stopping the stream', async () => {
    await requestMicrophone();

    expect(mockTrack.enabled).toBe(true);

    setMicrophoneMuted(true);
    expect(mockTrack.enabled).toBe(false);

    setMicrophoneMuted(false);
    expect(mockTrack.enabled).toBe(true);

    // Track should still be live and not stopped
    expect(mockTrack.stop).not.toHaveBeenCalled();
  });

  it('clears stored denial flags from localStorage and sessionStorage', () => {
    const mockStorage = {
      items: {
        mic_denied: 'true',
        afterspot_mic_denied: 'true',
      },
      removeItem: vi.fn(function (k) {
        delete this.items[k];
      }),
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });

    clearStoredDenialFlags();
    expect(mockStorage.removeItem).toHaveBeenCalledWith('mic_denied');
    expect(mockStorage.removeItem).toHaveBeenCalledWith('afterspot_mic_denied');
  });
});
