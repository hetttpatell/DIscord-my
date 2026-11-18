import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestCamera,
  requestCameraStream,
  stopCamera,
  setCameraTrackEnabled,
  getActiveCameraStream,
  getLastGetUserMediaResult,
} from '../src/lib/camera.js';

describe('Camera Permission & Stream Manager (src/lib/camera.js)', () => {
  let mockTrack;
  let mockStream;
  let mockGetUserMedia;
  let mockNavigator;
  let mockWindow;

  beforeEach(() => {
    stopCamera();

    mockTrack = {
      kind: 'video',
      readyState: 'live',
      enabled: true,
      stop: vi.fn(function () {
        this.readyState = 'ended';
      }),
    };

    mockStream = {
      getVideoTracks: vi.fn(() => [mockTrack]),
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

  it('fresh request: requestCameraStream calls getUserMedia with 720p constraints and user facingMode', async () => {
    const stream = await requestCameraStream({ facingMode: 'user' });

    expect(stream).toBe(mockStream);
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: 'user',
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });

    const lastResult = getLastGetUserMediaResult();
    expect(lastResult.ok).toBe(true);
    expect(getActiveCameraStream()).toBe(mockStream);
  });

  it('stops existing tracks before requesting a new camera stream to prevent hardware locks', async () => {
    await requestCameraStream();
    expect(mockTrack.stop).not.toHaveBeenCalled();

    // Call again to simulate re-acquisition
    await requestCameraStream();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('toggles video track enabled without stopping stream', async () => {
    await requestCameraStream();
    expect(mockTrack.enabled).toBe(true);

    const mutedResult = setCameraTrackEnabled(false);
    expect(mutedResult).toBe(true);
    expect(mockTrack.enabled).toBe(false);

    const unmutedResult = setCameraTrackEnabled(true);
    expect(unmutedResult).toBe(true);
    expect(mockTrack.enabled).toBe(true);
  });

  it('stopCamera cleans up active stream completely', async () => {
    await requestCameraStream();
    expect(getActiveCameraStream()).not.toBeNull();

    stopCamera();
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(getActiveCameraStream()).toBeNull();
  });

  it('handles OverconstrainedError by falling back to basic video: true', async () => {
    const overconstrained = new Error('Constraint not satisfied');
    overconstrained.name = 'OverconstrainedError';

    mockGetUserMedia
      .mockRejectedValueOnce(overconstrained)
      .mockResolvedValueOnce(mockStream);

    const stream = await requestCameraStream({ facingMode: 'user' });
    expect(stream).toBe(mockStream);
    expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    expect(mockGetUserMedia).toHaveBeenLastCalledWith({
      video: true,
      audio: false,
    });
  });

  it('requestCamera returns structured error on NotAllowedError', async () => {
    const deniedErr = new Error('Permission denied');
    deniedErr.name = 'NotAllowedError';
    mockGetUserMedia.mockRejectedValue(deniedErr);

    const res = await requestCamera();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('denied');
    expect(res.name).toBe('NotAllowedError');
  });

  it('requestCamera returns structured error on NotReadableError (camera in use)', async () => {
    const inUseErr = new Error('Device in use');
    inUseErr.name = 'NotReadableError';
    mockGetUserMedia.mockRejectedValue(inUseErr);

    const res = await requestCamera();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('in_use');
    expect(res.name).toBe('NotReadableError');
  });
});

