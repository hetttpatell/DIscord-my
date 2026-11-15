import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestMicrophone,
  stopMicrophone,
  setMicrophoneMuted,
  isInAppBrowser,
  subscribeToPermissionChange,
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

  it('fresh site: requests microphone with recommended constraints and succeeds', async () => {
    const result = await requestMicrophone();

    expect(result.ok).toBe(true);
    expect(result.stream).toBe(mockStream);
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  });

  it('previously allowed: reuses existing stream without re-invoking getUserMedia', async () => {
    const firstResult = await requestMicrophone();
    expect(firstResult.ok).toBe(true);
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);

    const secondResult = await requestMicrophone();
    expect(secondResult.ok).toBe(true);
    expect(secondResult.stream).toBe(mockStream);
    // Should NOT call getUserMedia a second time
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
  });

  it('previously blocked: NotAllowedError maps to reason "denied"', async () => {
    const error = new Error('Permission denied');
    error.name = 'NotAllowedError';
    mockGetUserMedia.mockRejectedValue(error);

    const result = await requestMicrophone();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('denied');
    expect(result.name).toBe('NotAllowedError');
    expect(result.message).toBe('Microphone access denied.');
  });

  it('mic in use by another app: NotReadableError maps to reason "in_use"', async () => {
    const error = new Error('Could not start audio source');
    error.name = 'NotReadableError';
    mockGetUserMedia.mockRejectedValue(error);

    const result = await requestMicrophone();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('in_use');
    expect(result.name).toBe('NotReadableError');
    expect(result.message).toBe('Microphone is being used by another app or tab. Close it and try again.');
  });

  it('no microphone found: NotFoundError maps to reason "not_found"', async () => {
    const error = new Error('Requested device not found');
    error.name = 'NotFoundError';
    mockGetUserMedia.mockRejectedValue(error);

    const result = await requestMicrophone();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_found');
    expect(result.name).toBe('NotFoundError');
    expect(result.message).toBe('No microphone found on this device.');
  });

  it('insecure context: returns reason "insecure" without calling getUserMedia', async () => {
    mockWindow.isSecureContext = false;

    const result = await requestMicrophone();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insecure');
    expect(result.message).toContain('secure (HTTPS)');
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });

  it('retries with fallback constraints on OverconstrainedError', async () => {
    const overconstrainedErr = new Error('Overconstrained');
    overconstrainedErr.name = 'OverconstrainedError';

    mockGetUserMedia
      .mockRejectedValueOnce(overconstrainedErr)
      .mockResolvedValueOnce(mockStream);

    const result = await requestMicrophone();

    expect(result.ok).toBe(true);
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

  it('Permissions API: subscribes to permission change and notifies on "granted"', async () => {
    let changeHandler;
    const mockStatus = {
      state: 'denied',
      addEventListener: vi.fn((event, handler) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };

    mockNavigator.permissions.query = vi.fn().mockResolvedValue(mockStatus);

    const onGranted = vi.fn();
    const unsubscribe = subscribeToPermissionChange(onGranted);

    // Wait for promise microtask to resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(mockStatus.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    // Simulate user toggling permission to 'granted' in site settings
    mockStatus.state = 'granted';
    changeHandler();

    expect(onGranted).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(mockStatus.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
